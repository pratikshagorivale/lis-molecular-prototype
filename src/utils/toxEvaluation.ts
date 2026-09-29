import type { ToxControlConfig, ToxCutOffOperator } from '../types/toxControl'
import type {
  BatchPosition,
  CompoundVerdict,
  ControlOutcome,
  ToxBatch,
} from '../types/tox'

/**
 * Evaluation for a toxicology plate.
 *
 * Deliberately the same shape as molecular: controls pass or fail, a failure
 * reaches as far as its configuration says, and a sample is valid unless the
 * plate's QC failed. Everything the lab can decide — control names, cut-offs,
 * how far a failure reaches — lives in Instrument Management.
 */

/**
 * Agilent exports the back-calculated concentration and its accuracy, but not
 * the nominal calibrator concentration. nominal = found / (accuracy / 100),
 * which lands a hair off a round number — 249.97 for a 250 ng/mL standard — so
 * snap it back to the value the method actually used.
 */
export function niceNominal(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return value
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [magnitude, magnitude / 2, magnitude / 4, magnitude / 5, magnitude / 10, magnitude / 20]) {
    const rounded = Math.round(value / step) * step
    if (Math.abs(rounded - value) / value <= 0.05) return Number(rounded.toPrecision(6))
  }
  return Number(value.toPrecision(3))
}

export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null
  const text = String(raw).trim()
  if (text === '' || text === '--' || text === 'NC' || text === 'N/A') return null
  const value = Number(text.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

/**
 * The cut-off this control sets for one drug.
 *
 * A drug-scoped control names its own; otherwise the control's single cut-off
 * covers every drug it sees. Null means the lab configured nothing, and a drug
 * with no cut-off is not judged.
 */
export function controlCutOff(control: ToxControlConfig | null, compound: string): number | null {
  if (!control) return null
  const named = control.drugs?.find((d) => d.drug === compound)?.cutOff
  const raw = named ?? control.cutOff
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Whether one drug met what its control expected of it.
 *
 * The lab states the side of the cut-off it expects — spiked material at or
 * above it, a blank below it — and the drug passes when it lands there. The
 * control's type does not decide this; the configured operator does.
 */
export function controlDrugPassed(
  concentration: number | null,
  cutOff: number,
  operator: ToxCutOffOperator,
): boolean {
  const found = concentration ?? 0
  return operator === '>=' ? found >= cutOff : found < cutOff
}

export function verdictFor(
  concentration: number | null,
  cutOff: number | null,
  lloq: number | null,
  uloq: number | null,
): CompoundVerdict {
  if (concentration == null || concentration <= 0) return 'Negative'
  if (uloq != null && concentration > uloq) return 'Over Curve'
  if (cutOff != null && concentration >= cutOff) return 'Positive'
  if (lloq != null && concentration < lloq) return 'Below LLOQ'
  return 'Negative'
}

/**
 * The drugs a failed control takes down with it.
 *
 * A control configured to fail the plate stops everything; one configured to
 * fail a drug voids only the drugs that were out of window. That is the lab's
 * decision, not a rule baked into the parser.
 */
export function voidedByControls(outcomes: ControlOutcome[], compounds: string[]): string[] {
  const voided = new Set<string>()
  for (const outcome of outcomes) {
    if (outcome.passed || outcome.failureBehavior !== 'fail-drug') continue
    for (const compound of outcome.failedCompounds) voided.add(compound)
  }
  return compounds.filter((c) => voided.has(c))
}

/** False when a control configured to fail the plate failed. */
export function qcPassedFor(outcomes: ControlOutcome[]): boolean {
  return !outcomes.some((o) => !o.passed && o.failureBehavior === 'fail-plate')
}

/**
 * Whether a sample's result can be trusted.
 *
 * As in molecular, a failed control reaches the samples it touched. A control
 * configured to fail the plate invalidates everything; one configured to fail a
 * drug invalidates every sample that carries that drug, because those results
 * were measured against a control the run cannot stand behind.
 *
 * What the sample itself contains is a finding, not a failure — a positive, or
 * a result above the curve needing dilution, is still a sound measurement.
 */
export function isPositionInvalid(position: BatchPosition, batch: ToxBatch): boolean {
  if (position.type !== 'Sample') return false
  if (!batch.qcPassed) return true
  if (batch.controlVoidedCompounds.length === 0) return false
  const voided = new Set(batch.controlVoidedCompounds)
  return position.results.some((r) => voided.has(r.compound))
}

export type QcBannerTone = 'pass' | 'fail' | 'warn'

export interface ToxQcBannerItem {
  label: string
  tone: QcBannerTone
}

/**
 * The QC banner line, in the shape molecular uses: one short clause per
 * control, read left to right.
 */
export function toxQcBanner(batch: ToxBatch): ToxQcBannerItem[] {
  const items: ToxQcBannerItem[] = batch.controlOutcomes.map((outcome) => {
    if (outcome.passed) return { label: `${outcome.name} Passed`, tone: 'pass' as const }
    const where = outcome.positionId ? ` · ${outcome.positionId}` : ''
    return { label: `${outcome.name} Failed${where}`, tone: 'fail' as const }
  })

  if (batch.voidedCompounds.length > 0) {
    items.push({
      label: `${batch.voidedCompounds.length} drug${batch.voidedCompounds.length === 1 ? '' : 's'} voided`,
      tone: 'warn',
    })
  }
  return items
}

export function formatConcentration(value: number | null): string {
  if (value == null) return '—'
  if (value === 0) return '0'
  if (value >= 100000) return value.toExponential(2)
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

export function batchCounts(batch: ToxBatch) {
  const samples = batch.positions.filter((p) => p.type === 'Sample')
  return {
    samples: samples.length,
    controls: batch.positions.length - samples.length,
    positive: samples.filter((p) => p.positivesCount > 0).length,
    dilution: samples.filter((p) => p.requiresDilution).length,
    invalid: samples.filter((p) => isPositionInvalid(p, batch)).length,
  }
}
