import type { FailedControlWell, InstrumentControlConfig, WellData } from '../types'
import type { RawMolecularRow } from './parseMolecularFile'
import type { ControlType } from './qcDetection'
import { controlRowFailed, findControlConfigForWell } from './controlEvaluation'
import { expandInstrumentTargetName, normalizeTargetName } from './targetNames'

export { normalizeTargetName, expandInstrumentTargetName } from './targetNames'
import { normalizeWell } from './wellPosition'

function getWellRows(records: RawMolecularRow[], wellId: string): RawMolecularRow[] {
  return records.filter((r) => normalizeWell(r.well) === wellId)
}

function addExpandedTarget(
  affected: Set<string>,
  name: string,
  catalogTargets: string[],
) {
  for (const expanded of expandInstrumentTargetName(name, catalogTargets)) {
    affected.add(expanded)
  }
}

function addFailedRowTargets(
  affected: Set<string>,
  targetRows: RawMolecularRow[],
  configured: { target: string }[],
  type: ControlType,
  catalogTargets: string[],
  onlyFailedRows: boolean,
  config?: InstrumentControlConfig,
) {
  for (let i = 0; i < targetRows.length; i++) {
    const row = targetRows[i]
    if (onlyFailedRows && !controlRowFailed(row, type, config, catalogTargets)) continue

    affected.add(normalizeTargetName(row.target))
    if (configured[i]) {
      addExpandedTarget(affected, configured[i].target, catalogTargets)
    }
  }
}

export function computeAffectedTargetsFromFailedTargetedControls(
  records: RawMolecularRow[],
  failedControlWells: FailedControlWell[],
  instrumentControls: InstrumentControlConfig[],
  catalogTargets: string[],
): Set<string> {
  const affected = new Set<string>()

  for (const failed of failedControlWells) {
    const type = failed.controlType as ControlType
    const wellRows = getWellRows(records, failed.wellId)
    const targetRows = wellRows.filter((r) => r.target?.trim())
    const config = findControlConfigForWell(wellRows, instrumentControls)
    const configured = config?.targets ?? []

    if (config?.scope === 'targeted' && config.targetedFailureBehavior === 'fail-target') {
      addFailedRowTargets(affected, targetRows, configured, type, catalogTargets, true, config)
      continue
    }

    if (config?.scope === 'targeted' && config.targetedFailureBehavior === 'fail-plate') {
      for (const target of configured) {
        addExpandedTarget(affected, target.target, catalogTargets)
      }
      addFailedRowTargets(affected, targetRows, configured, type, catalogTargets, true, config)
      continue
    }

    addFailedRowTargets(affected, targetRows, configured, type, catalogTargets, true, config)
  }

  return affected
}

export function isSampleWell(
  well: Pick<WellData, 'status' | 'isQc' | 'panel' | 'qcType' | 'sampleId'>,
): boolean {
  if (well.status === 'empty') return false
  if (well.isQc || well.panel === 'Control' || !!well.qcType) return false
  if (/^(PC|NC|NTC|IC)\b/i.test(well.sampleId?.trim() || '')) return false
  return true
}

export function isValidSampleWell(
  well: Pick<WellData, 'status' | 'isQc' | 'panel' | 'qcType' | 'sampleId' | 'affectedByTargetedControlFailure'>,
): boolean {
  return isSampleWell(well) && !well.affectedByTargetedControlFailure
}

export function collectWellTargetNames(
  well: Pick<WellData, 'ctValues' | 'targetRows' | 'detectedTargets' | 'notDetectedTargets'>,
): Set<string> {
  const targets = new Set<string>()
  for (const cv of well.ctValues) {
    if (cv.target?.trim()) targets.add(normalizeTargetName(cv.target))
  }
  for (const row of well.targetRows) {
    if (row.target?.trim()) targets.add(normalizeTargetName(row.target))
  }
  for (const target of well.detectedTargets) {
    if (target?.trim()) targets.add(normalizeTargetName(target))
  }
  for (const target of well.notDetectedTargets) {
    if (target?.trim()) targets.add(normalizeTargetName(target))
  }
  return targets
}

export function wellTestsAffectedTarget(
  well: Pick<
    WellData,
    'status' | 'isQc' | 'panel' | 'qcType' | 'sampleId' | 'ctValues' | 'targetRows' | 'detectedTargets' | 'notDetectedTargets'
  >,
  affected: Set<string>,
): boolean {
  if (!isSampleWell(well) || affected.size === 0) return false
  const targets = collectWellTargetNames(well)
  for (const target of targets) {
    if (affected.has(target)) return true
  }
  return false
}
