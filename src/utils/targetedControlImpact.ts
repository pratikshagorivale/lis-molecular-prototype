import type { FailedControlWell, InstrumentControlConfig, WellData } from '../types'
import type { RawMolecularRow } from './parseMolecularFile'
import type { ControlType } from './qcDetection'
import { isControlDetected, isControlNotDetected } from './qcDetection'
import { normalizeWell } from './wellPosition'

const CONTROL_TYPE_TO_CONFIG: Record<ControlType, InstrumentControlConfig['controlType']> = {
  PC: 'Positive Control',
  NC: 'Negative Control',
  NTC: 'NTC',
  IC: 'Internal Control',
}

export function normalizeTargetName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function expandInstrumentTargetName(name: string, catalogTargets: string[]): string[] {
  const result = new Set<string>([normalizeTargetName(name)])
  const match = name.trim().match(/^organism\s*(\d+)$/i)
  if (match) {
    const idx = parseInt(match[1], 10) - 1
    if (idx >= 0 && idx < catalogTargets.length) {
      result.add(normalizeTargetName(catalogTargets[idx]))
    }
  }
  return [...result]
}

function getWellRows(records: RawMolecularRow[], wellId: string): RawMolecularRow[] {
  return records.filter((r) => normalizeWell(r.well) === wellId)
}

function rowFailsControlCheck(row: RawMolecularRow, type: ControlType): boolean {
  return type === 'PC' || type === 'IC' ? !isControlDetected(row) : !isControlNotDetected(row)
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
) {
  for (let i = 0; i < targetRows.length; i++) {
    const row = targetRows[i]
    if (onlyFailedRows && !rowFailsControlCheck(row, type)) continue

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
    if (!CONTROL_TYPE_TO_CONFIG[type]) continue

    const config = instrumentControls.find(
      (c) => c.controlType === CONTROL_TYPE_TO_CONFIG[type] && c.scope === 'targeted',
    )
    const wellRows = getWellRows(records, failed.wellId)
    const targetRows = wellRows.filter((r) => r.target?.trim())
    const configured = config?.targets ?? []

    if (config?.targets?.length && config.targetedFailureBehavior === 'warning-only') continue

    if (config?.targets?.length && config.targetedFailureBehavior === 'fail-plate') {
      for (const target of configured) {
        addExpandedTarget(affected, target.target, catalogTargets)
      }
      addFailedRowTargets(affected, targetRows, configured, type, catalogTargets, true)
      continue
    }

    if (config?.targets?.length) {
      addFailedRowTargets(affected, targetRows, configured, type, catalogTargets, true)
      continue
    }

    addFailedRowTargets(affected, targetRows, configured, type, catalogTargets, true)
  }

  return affected
}

function isSampleWell(well: Pick<WellData, 'status' | 'isQc' | 'panel' | 'qcType' | 'sampleId'>): boolean {
  if (well.status === 'empty') return false
  if (well.isQc || well.panel === 'Control' || !!well.qcType) return false
  if (/^(PC|NC|NTC|IC)$/i.test(well.sampleId?.trim() || '')) return false
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
