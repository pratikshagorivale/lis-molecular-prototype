import type { InstrumentControlConfig } from '../types'
import type { RawMolecularRow } from './parseMolecularFile'
import {
  findControlConfigForWell,
  groupControlWells,
  rowPassesControlCriteria,
  wellPassesConfiguredControl,
} from './controlEvaluation'
import {
  classifyControlType,
  isControlRecord,
  isPlateStyleControlId,
  isTargetStyleControlId,
  type ControlType,
} from './qcDetection'
import { normalizeTargetName } from './targetNames'

export interface TargetControlEntry {
  controlType: ControlType
  passed: boolean
  wellId: string
  sampleId: string
}

export interface FileControlIndex {
  hasPlateControls: boolean
  hasTargetControls: boolean
  plateControlsPassed: boolean
  targetControlsPassed: boolean
  hasPlatePc: boolean
  platePcPassed: boolean
  hasPlateNc: boolean
  plateNcPassed: boolean
  hasTargetPc: boolean
  targetPcPassed: boolean
  hasTargetNc: boolean
  targetNcPassed: boolean
  /** Normalized target name → target-style control rows in the file. */
  targetByTarget: Map<string, TargetControlEntry[]>
  failedPlateControlWells: string[]
  failedTargetControls: TargetControlEntry[]
}

function wellSampleId(rows: RawMolecularRow[]): string {
  return (rows.find((r) => r.sampleId.trim())?.sampleId ?? rows[0]?.sampleId ?? '').trim()
}

function expectedStatusForType(type: ControlType): 'Detected' | 'Not Detected' {
  return type === 'PC' || type === 'IC' ? 'Detected' : 'Not Detected'
}

function rowPassesForControlType(row: RawMolecularRow, type: ControlType): boolean {
  return rowPassesControlCriteria(row, expectedStatusForType(type))
}

function isPlateStyleControlWell(rows: RawMolecularRow[]): boolean {
  if (!rows.some((r) => isControlRecord(r))) return false
  const sampleId = wellSampleId(rows)
  if (isPlateStyleControlId(sampleId)) return true
  if (isTargetStyleControlId(sampleId)) return false

  const target = (rows.find((r) => r.target?.trim())?.target ?? '').toUpperCase()
  return /POSITIVE CONTROL|NEGATIVE CONTROL|NO TEMPLATE|INTERNAL CONTROL/.test(target)
}

function isTargetStyleControlWell(rows: RawMolecularRow[]): boolean {
  if (!rows.some((r) => isControlRecord(r))) return false
  return isTargetStyleControlId(wellSampleId(rows))
}

function wellPassesPlateControl(
  rows: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[],
  catalogTargets: string[],
): boolean {
  const config = findControlConfigForWell(rows, instrumentControls)
  if (config) return wellPassesConfiguredControl(rows, config, catalogTargets)

  const type = classifyControlType(rows[0])
  if (!type) return false
  const dataRows = rows.filter((r) => r.target?.trim())
  if (dataRows.length === 0) return rows.every((r) => rowPassesForControlType(r, type))
  return dataRows.every((r) => rowPassesForControlType(r, type))
}

function addTargetEntry(
  map: Map<string, TargetControlEntry[]>,
  targetName: string,
  entry: TargetControlEntry,
) {
  const key = normalizeTargetName(targetName)
  const list = map.get(key) ?? []
  list.push(entry)
  map.set(key, list)
}

export function buildFileControlIndex(
  records: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[] = [],
  catalogTargets: string[] = [],
): FileControlIndex {
  const targetByTarget = new Map<string, TargetControlEntry[]>()
  const failedPlateControlWells: string[] = []
  const failedTargetControls: TargetControlEntry[] = []

  let hasPlateControls = false
  let hasTargetControls = false
  let plateControlsPassed = true
  let targetControlsPassed = true
  let hasPlatePc = false
  let platePcPassed = true
  let hasPlateNc = false
  let plateNcPassed = true
  let hasTargetPc = false
  let targetPcPassed = true
  let hasTargetNc = false
  let targetNcPassed = true

  for (const [wellId, rawRows] of groupControlWells(records)) {
    if (isPlateStyleControlWell(rawRows)) {
      hasPlateControls = true
      const type = classifyControlType(rawRows[0])
      const passed = wellPassesPlateControl(rawRows, instrumentControls, catalogTargets)
      if (!passed) {
        plateControlsPassed = false
        failedPlateControlWells.push(wellId)
      }
      if (type === 'PC') {
        hasPlatePc = true
        if (!passed) platePcPassed = false
      }
      if (type === 'NC') {
        hasPlateNc = true
        if (!passed) plateNcPassed = false
      }
      continue
    }

    if (!isTargetStyleControlWell(rawRows)) continue

    hasTargetControls = true
    const type = classifyControlType(rawRows[0])
    if (!type) continue

    const sampleId = wellSampleId(rawRows)
    const config = findControlConfigForWell(rawRows, instrumentControls)
    const dataRows = rawRows.filter((r) => r.target?.trim())
    const wellPassed = config
      ? wellPassesConfiguredControl(rawRows, config, catalogTargets)
      : dataRows.every((row) => rowPassesForControlType(row, type))

    if (type === 'PC') {
      hasTargetPc = true
      if (!wellPassed) targetPcPassed = false
    }
    if (type === 'NC') {
      hasTargetNc = true
      if (!wellPassed) targetNcPassed = false
    }

    for (const row of dataRows) {
      const passed = config
        ? wellPassed
        : rowPassesForControlType(row, type)

      const entry: TargetControlEntry = {
        controlType: type,
        passed,
        wellId,
        sampleId,
      }
      addTargetEntry(targetByTarget, row.target, entry)

      if (!passed) {
        targetControlsPassed = false
        failedTargetControls.push(entry)
      }
    }
  }

  return {
    hasPlateControls,
    hasTargetControls,
    plateControlsPassed,
    targetControlsPassed,
    hasPlatePc,
    platePcPassed,
    hasPlateNc,
    plateNcPassed,
    hasTargetPc,
    targetPcPassed,
    hasTargetNc,
    targetNcPassed,
    targetByTarget,
    failedPlateControlWells,
    failedTargetControls,
  }
}

function targetControlsForSampleTarget(
  index: FileControlIndex,
  targetName: string,
): TargetControlEntry[] {
  return index.targetByTarget.get(normalizeTargetName(targetName)) ?? []
}

/**
 * Per-target sample validation:
 * - Plate controls only → use plate control pass/fail for every sample target.
 * - Target controls only → sample target must have a matching target control that passed.
 * - Both present → use matching target control when available, otherwise fall back to plate control.
 */
export function isSampleTargetControlPassed(
  targetName: string,
  index: FileControlIndex,
): boolean {
  const matchingTargetControls = targetControlsForSampleTarget(index, targetName)

  if (index.hasPlateControls && index.hasTargetControls) {
    if (matchingTargetControls.length > 0) {
      return matchingTargetControls.every((entry) => entry.passed)
    }
    return index.plateControlsPassed
  }

  if (index.hasTargetControls) {
    if (matchingTargetControls.length === 0) return false
    return matchingTargetControls.every((entry) => entry.passed)
  }

  if (index.hasPlateControls) {
    return index.plateControlsPassed
  }

  return true
}

export function affectedTargetsFromFileControls(index: FileControlIndex): Set<string> {
  const affected = new Set<string>()
  for (const [target, entries] of index.targetByTarget) {
    if (entries.some((entry) => !entry.passed)) {
      affected.add(target)
    }
  }
  return affected
}

export function shouldInvalidateAllSamplesFromFileControls(
  index: FileControlIndex,
  instrumentControls: InstrumentControlConfig[],
): boolean {
  if (!index.hasPlateControls || index.plateControlsPassed) return false
  if (instrumentControls.length === 0) return true

  const plateConfigs = instrumentControls.filter(
    (config) => config.scope === 'plate' && config.plateFailureBehavior !== 'warning-only',
  )
  if (plateConfigs.length === 0) {
    return instrumentControls.some(
      (config) => config.targetedFailureBehavior === 'fail-plate',
    )
  }
  return true
}

export function collectWellTargetNamesFromRows(rows: RawMolecularRow[]): string[] {
  return rows
    .filter((row) => row.target?.trim() && !isControlRecord(row))
    .map((row) => normalizeTargetName(row.target))
}

export function isWellTargetsControlValid(
  targetNames: string[],
  index: FileControlIndex,
): boolean {
  if (targetNames.length === 0) return true
  return targetNames.every((target) => isSampleTargetControlPassed(target, index))
}

function controlTypePassed(
  hasPlate: boolean,
  platePassed: boolean,
  hasTarget: boolean,
  targetPassed: boolean,
): { present: boolean; passed: boolean } {
  const present = hasPlate || hasTarget
  if (!present) return { present: false, passed: true }
  const passed = (!hasPlate || platePassed) && (!hasTarget || targetPassed)
  return { present, passed }
}

export function evaluatePlateQcFromFileControls(
  records: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[] = [],
  catalogTargets: string[] = [],
): import('./qcDetection').PlateQcEvaluation {
  const index = buildFileControlIndex(records, instrumentControls, catalogTargets)

  const pc = controlTypePassed(index.hasPlatePc, index.platePcPassed, index.hasTargetPc, index.targetPcPassed)
  const nc = controlTypePassed(index.hasPlateNc, index.plateNcPassed, index.hasTargetNc, index.targetNcPassed)
  const ntc = { present: false, passed: true }
  const ic = { present: false, passed: true }

  const qcPassed = (!pc.present || pc.passed) && (!nc.present || nc.passed)
  const failedControlWells = [
    ...index.failedPlateControlWells.map((wellId) => ({
      wellId,
      controlType: 'PC',
      sampleId: '',
      label: wellId,
    })),
    ...index.failedTargetControls.map((entry) => ({
      wellId: entry.wellId,
      controlType: entry.controlType,
      sampleId: entry.sampleId,
      label: entry.sampleId,
    })),
  ]

  let status: 'QC Passed' | 'Failed' | 'Needs Review'
  if (qcPassed) status = 'QC Passed'
  else if (!pc.present || !nc.present) status = 'Needs Review'
  else status = 'Failed'

  return { pc, nc, ntc, ic, qcPassed, failedControlWells, status }
}
