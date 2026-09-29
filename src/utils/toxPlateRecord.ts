import { CURRENT_USER } from '../data/plateTrackingMockData'
import { batchCounts, isPositionInvalid } from './toxEvaluation'
import type { PlateQcControl, PlateRecord, PlateSampleRef, SampleStatus } from '../types'
import type { ToxBatch } from '../types/tox'

/**
 * A toxicology batch as a registry plate.
 *
 * Plate tracking, the audit trail and CAPA are not molecular features — they
 * are how this lab accounts for any plate. Rather than build a parallel set for
 * toxicology, a batch is projected onto the same `PlateRecord` so one registry
 * holds both and All Plates lists them together.
 */

function sampleStatus(batch: ToxBatch, invalid: boolean, positives: number): SampleStatus {
  if (invalid) return 'Failed'
  if (batch.status === 'Released') return 'Ready for Release'
  return positives > 0 ? 'Needs Review' : 'Ready'
}

/** Each configured control, keyed by the name the lab gave it. */
export function toxQcControls(batch: ToxBatch): PlateQcControl[] {
  return batch.controlOutcomes.map((outcome) => ({
    control: outcome.name,
    wells: outcome.positionId ? [outcome.positionId] : [],
    passed: outcome.passed,
    detail: outcome.detail,
    summary: outcome.passed
      ? undefined
      : `${outcome.name} expected ${outcome.expected} — ${outcome.detail}.`,
  }))
}

export function toxPlateSamples(batch: ToxBatch): PlateSampleRef[] {
  return batch.positions
    .filter((p) => p.type === 'Sample')
    .map((p) => ({
      sampleId: p.sampleId,
      accessionNumber: p.accessionNumber,
      patient: p.patient,
      wellId: p.positionId,
      status: sampleStatus(batch, isPositionInvalid(p, batch), p.positivesCount),
    }))
}

/**
 * Fold a batch into the registry, keeping whatever the plate has already
 * accumulated — its audit trail, its CAPAs and its lifecycle status.
 */
export function mergeToxBatchIntoRegistry(
  registry: PlateRecord[],
  batch: ToxBatch | null,
): PlateRecord[] {
  const plateId = batch?.batchId?.trim()
  if (!batch || !plateId) return registry

  const counts = batchCounts(batch)
  const qcOutcome = batch.qcPassed ? ('Passed' as const) : ('Failed' as const)
  const uploadedAt = new Date().toISOString()

  const existing = registry.find((p) => p.plateId.toUpperCase() === plateId.toUpperCase())
  const rest = registry.filter((p) => p.plateId.toUpperCase() !== plateId.toUpperCase())

  const shared = {
    samplesProcessed: counts.samples,
    samplesValid: counts.samples - counts.invalid,
    samplesInvalid: counts.invalid,
    qcOutcome,
    qcControls: toxQcControls(batch),
    samples: toxPlateSamples(batch),
  }

  const current: PlateRecord = existing
    ? { ...existing, ...shared }
    : {
        plateId,
        runDate: batch.runDate || uploadedAt,
        instrument: batch.instrument || 'Toxicology Instrument',
        ...shared,
        status: 'Pending',
        uploadedBy: CURRENT_USER.name,
        uploadedAt,
        auditTrail: [
          {
            id: `evt-tox-${plateId}-upload`,
            action: 'uploaded' as const,
            actor: CURRENT_USER.name,
            actorRole: CURRENT_USER.role,
            timestamp: uploadedAt,
            summary: `Plate uploaded from ${batch.fileName}`,
          },
          {
            id: `evt-tox-${plateId}-qc`,
            action: 'qc-result' as const,
            actor: 'System',
            actorRole: 'Automated',
            timestamp: uploadedAt,
            summary: batch.qcPassed
              ? 'QC passed on every configured control.'
              : 'QC failed — a control configured to fail the plate did not pass.',
            qcResults: batch.controlOutcomes.map((o) => ({
              control: o.name,
              passed: o.passed,
              detail: o.detail,
            })),
          },
        ],
        capa: [],
      }

  return [current, ...rest]
}
