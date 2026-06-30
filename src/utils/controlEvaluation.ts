import type { AmpStatusOption, InstrumentControlConfig, TargetedControlTarget } from '../types'
import type { RawMolecularRow } from './parseMolecularFile'
import { matchesCtCutOff } from './ctCutOff'
import {
  classifyControlType,
  controlLabel,
  isControlDetected,
  isControlNotDetected,
  isControlRecord,
  isTargetStyleControlId,
  type ControlType,
} from './qcDetection'
import { isInconclusiveAmpStatus } from './interpretation'
import { expandInstrumentTargetName, normalizeTargetName } from './targetNames'
import { normalizeWell } from './wellPosition'

const CONTROL_TYPE_TO_CONFIG: Record<ControlType, InstrumentControlConfig['controlType']> = {
  PC: 'Positive Control',
  NC: 'Negative Control',
  NTC: 'NTC',
  IC: 'Internal Control',
}

const CONFIG_TYPE_TO_CONTROL: Partial<Record<InstrumentControlConfig['controlType'], ControlType>> = {
  'Positive Control': 'PC',
  'Negative Control': 'NC',
  NTC: 'NTC',
  'Internal Control': 'IC',
}

function enrichWellControlRows(rows: RawMolecularRow[]): RawMolecularRow[] {
  const anchor = rows.find((r) => r.isQc || r.qcType || isControlRecord(r)) ?? rows[0]
  const sampleId = anchor.sampleId.trim()
  const qcType = anchor.qcType
  const isQc = rows.some((r) => r.isQc) || !!qcType || isControlRecord(anchor)

  return rows.map((r) => ({
    ...r,
    sampleId: r.sampleId.trim() || sampleId,
    qcType: r.qcType || qcType,
    isQc: r.isQc || isQc,
    panel: r.panel || anchor.panel,
  }))
}

function resolveWellControlType(rows: RawMolecularRow[]): ControlType | null {
  for (const r of rows) {
    const type = classifyControlType(r)
    if (type) return type
  }
  return null
}

function wellSampleId(rows: RawMolecularRow[]): string {
  return (rows.find((r) => r.sampleId.trim())?.sampleId ?? rows[0]?.sampleId ?? '').trim()
}

function expectedStatusForControlType(
  type: ControlType,
  config: InstrumentControlConfig,
): AmpStatusOption {
  if (config.status) return config.status
  if (type === 'PC' || type === 'IC') return 'Detected'
  return 'Not Detected'
}

function targetStyleWellPasses(
  rows: RawMolecularRow[],
  config: InstrumentControlConfig,
): boolean {
  const type = resolveWellControlType(rows)
  if (!type) return false

  const expected = expectedStatusForControlType(type, config)
  const dataRows = rows.filter((r) => r.target?.trim())
  if (dataRows.length === 0) return false

  return dataRows.every((r) => rowPassesControlCriteria(r, expected, config.expectedResultCtCutOff))
}

function controlNamesMatch(wellName: string, configName: string): boolean {
  const well = wellName.trim().toUpperCase()
  const config = configName.trim().toUpperCase()
  if (well === config) return true
  if (config === 'PC' && /^PC\b/.test(well)) return true
  if (config === 'NC' && /^NC\b/.test(well)) return true
  if (config === 'NTC' && /^NTC\b/.test(well)) return true
  if (config === 'IC' && /^IC\b/.test(well)) return true
  return false
}

export function findControlConfigForWell(
  rows: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[],
): InstrumentControlConfig | undefined {
  const enriched = enrichWellControlRows(rows)
  const first = enriched.find((r) => r.sampleId.trim()) ?? enriched[0]
  const sampleId = first?.sampleId?.trim() ?? ''

  const byName = instrumentControls.find((c) => controlNamesMatch(sampleId, c.control))
  if (byName) return byName

  const type = resolveWellControlType(enriched)
  if (!type) return undefined

  return instrumentControls.find((c) => c.controlType === CONTROL_TYPE_TO_CONFIG[type])
}

export function groupControlWells(records: RawMolecularRow[]): Map<string, RawMolecularRow[]> {
  const byWell = new Map<string, RawMolecularRow[]>()
  for (const row of records) {
    const wellId = normalizeWell(row.well)
    if (!wellId) continue
    const list = byWell.get(wellId) ?? []
    list.push(row)
    byWell.set(wellId, list)
  }
  return byWell
}

export function matchesExpectedInterpretation(
  row: Pick<RawMolecularRow, 'interpretation' | 'ampStatus' | 'ct'>,
  expected: AmpStatusOption,
): boolean {
  if (expected === 'Detected') return isControlDetected(row)
  if (expected === 'Not Detected') return isControlNotDetected(row)
  return isInconclusiveAmpStatus(row.ampStatus)
    || String(row.interpretation ?? '').toLowerCase().includes('inconclusive')
}

export function rowPassesControlCriteria(
  row: RawMolecularRow,
  expectedStatus: AmpStatusOption,
  ctCutOff?: string,
): boolean {
  if (!matchesExpectedInterpretation(row, expectedStatus)) return false
  if (!ctCutOff?.trim()) return true

  const ctMatch = matchesCtCutOff(row.ct, ctCutOff)
  if (ctMatch === false) return false
  if (ctMatch === null) return false
  return true
}

export function rowPassesTargetConfig(
  row: RawMolecularRow,
  targetConfig: TargetedControlTarget,
  catalogTargets: string[],
): boolean {
  const expanded = expandInstrumentTargetName(targetConfig.target, catalogTargets)
  if (!expanded.includes(normalizeTargetName(row.target))) return false
  return rowPassesControlCriteria(row, targetConfig.status, targetConfig.ctCutOff)
}

export function wellPassesConfiguredControl(
  rows: RawMolecularRow[],
  config: InstrumentControlConfig,
  catalogTargets: string[] = [],
): boolean {
  const enriched = enrichWellControlRows(rows)
  if (!enriched.some((r) => isControlRecord(r))) return false

  if (isTargetStyleControlId(wellSampleId(enriched))) {
    return targetStyleWellPasses(enriched, config)
  }

  if (config.scope === 'targeted' && config.targets?.length) {
    for (const targetConfig of config.targets) {
      const expanded = expandInstrumentTargetName(targetConfig.target, catalogTargets)
      const matchingRows = enriched.filter((r) => expanded.includes(normalizeTargetName(r.target)))
      if (matchingRows.length === 0) return false
      if (!matchingRows.some((r) => rowPassesTargetConfig(r, targetConfig, catalogTargets))) return false
    }
    return true
  }

  const expectedStatus = config.status ?? 'Detected'
  const ctCutOff = config.expectedResultCtCutOff
  return enriched
    .filter((r) => isControlRecord(r) || r.target?.trim())
    .every((r) => rowPassesControlCriteria(r, expectedStatus, ctCutOff))
}

export function controlFailureFailsPlate(config: InstrumentControlConfig): boolean {
  if (config.scope === 'plate') return config.plateFailureBehavior !== 'warning-only'
  return config.targetedFailureBehavior === 'fail-plate'
}

export function findWellsForConfig(
  records: RawMolecularRow[],
  config: InstrumentControlConfig,
): RawMolecularRow[][] {
  const wells: RawMolecularRow[][] = []
  for (const rows of groupControlWells(records).values()) {
    const enriched = enrichWellControlRows(rows)
    if (!enriched.some((r) => isControlRecord(r))) continue
    const matched = findControlConfigForWell(enriched, [config])
    if (matched?.id === config.id) wells.push(enriched)
  }
  return wells
}

export function controlTypeForConfig(config: InstrumentControlConfig): ControlType | null {
  return CONFIG_TYPE_TO_CONTROL[config.controlType] ?? null
}

export function controlRowFailed(
  row: RawMolecularRow,
  type: ControlType,
  config: InstrumentControlConfig | undefined,
  catalogTargets: string[],
): boolean {
  if (!config) {
    return type === 'PC' || type === 'IC' ? !isControlDetected(row) : !isControlNotDetected(row)
  }
  if (config.scope === 'targeted' && config.targets?.length) {
    const targetConfig = config.targets.find((target) =>
      expandInstrumentTargetName(target.target, catalogTargets).includes(normalizeTargetName(row.target)),
    )
    if (!targetConfig) return false
    return !rowPassesTargetConfig(row, targetConfig, catalogTargets)
  }
  return !rowPassesControlCriteria(row, config.status ?? 'Detected', config.expectedResultCtCutOff)
}

export function isControlTypeConfigured(
  type: ControlType,
  instrumentControls: InstrumentControlConfig[],
): boolean {
  return instrumentControls.some((config) => controlTypeForConfig(config) === type)
}

export function shouldInvalidateAllSamplesOnControlFailure(
  records: RawMolecularRow[],
  failedControlWells: { wellId: string }[],
  instrumentControls: InstrumentControlConfig[],
  catalogTargets: string[] = [],
): boolean {
  if (failedControlWells.length === 0) return false

  if (instrumentControls.length === 0) {
    return failedControlWells.length > 0
  }

  const failures = getConfiguredFailedControlWells(records, instrumentControls, catalogTargets)
  return failures.some((failure) => controlFailureFailsPlate(failure.config))
}

export function getConfiguredFailedControlWells(
  records: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[],
  catalogTargets: string[] = [],
): { wellId: string; controlType: ControlType; sampleId: string; label: string; config: InstrumentControlConfig }[] {
  const failed: { wellId: string; controlType: ControlType; sampleId: string; label: string; config: InstrumentControlConfig }[] = []

  for (const [wellId, rawRows] of groupControlWells(records)) {
    const rows = enrichWellControlRows(rawRows)
    if (!rows.some((r) => isControlRecord(r))) continue

    const config = findControlConfigForWell(rows, instrumentControls)
    if (!config) continue
    if (wellPassesConfiguredControl(rows, config, catalogTargets)) continue

    const type = resolveWellControlType(rows) ?? controlTypeForConfig(config)
    if (!type) continue

    const first = rows.find((r) => r.sampleId.trim()) ?? rows[0]
    failed.push({
      wellId,
      controlType: type,
      sampleId: first.sampleId.trim() || controlLabel(first),
      label: controlLabel(first),
      config,
    })
  }

  return failed.sort((a, b) => a.wellId.localeCompare(b.wellId, undefined, { numeric: true }))
}

export function evaluatePlateQcFromConfig(
  records: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[],
  catalogTargets: string[] = [],
): import('./qcDetection').PlateQcEvaluation {
  function typeResult(type: ControlType): { present: boolean; passed: boolean } {
    const configs = instrumentControls.filter((c) => controlTypeForConfig(c) === type)
    if (configs.length === 0) return { present: false, passed: true }

    const present = configs.every((config) => findWellsForConfig(records, config).length > 0)
    const passed = configs.every((config) => {
      const wells = findWellsForConfig(records, config)
      return wells.length > 0 && wells.every((well) => wellPassesConfiguredControl(well, config, catalogTargets))
    })
    return { present, passed }
  }

  const pc = typeResult('PC')
  const nc = typeResult('NC')
  const ntc = typeResult('NTC')
  const ic = typeResult('IC')

  const configuredFailures = getConfiguredFailedControlWells(records, instrumentControls, catalogTargets)
  const failedControlWells = configuredFailures.map(({ wellId, controlType, sampleId, label }) => ({
    wellId,
    controlType,
    sampleId,
    label,
  }))

  const qcPassed = instrumentControls.every((config) => {
    const wells = findWellsForConfig(records, config)
    if (wells.length === 0) return false
    const passes = wells.every((well) => wellPassesConfiguredControl(well, config, catalogTargets))
    if (passes) return true
    return !controlFailureFailsPlate(config)
  })

  let status: 'QC Passed' | 'Failed' | 'Needs Review'
  if (qcPassed) {
    status = 'QC Passed'
  } else if (
    configuredFailures.some((f) => controlFailureFailsPlate(f.config))
    || instrumentControls.some((config) => findWellsForConfig(records, config).length === 0)
  ) {
    status = 'Failed'
  } else {
    status = 'Needs Review'
  }

  return { pc, nc, ntc, ic, qcPassed, failedControlWells, status }
}

export function getConfiguredPlateControlValidations(
  records: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[],
  catalogTargets: string[] = [],
): { control: string; position: string; status: 'Pass' | 'Fail' }[] {
  const validations: { control: string; position: string; status: 'Pass' | 'Fail'; sortType: ControlType }[] = []

  for (const [wellId, rawRows] of groupControlWells(records)) {
    const rows = enrichWellControlRows(rawRows)
    if (!rows.some((r) => isControlRecord(r))) continue

    const config = findControlConfigForWell(rows, instrumentControls)
    if (!config) continue

    const type = resolveWellControlType(rows) ?? controlTypeForConfig(config)
    if (!type) continue

    const first = rows.find((r) => r.sampleId.trim()) ?? rows[0]
    validations.push({
      control: first.sampleId.trim() || controlLabel(first),
      position: wellId,
      status: wellPassesConfiguredControl(rows, config, catalogTargets) ? 'Pass' : 'Fail',
      sortType: type,
    })
  }

  const CONTROL_TYPE_ORDER: Record<ControlType, number> = { PC: 0, NC: 1, NTC: 2, IC: 3 }
  return validations
    .sort((a, b) => {
      const typeOrder = CONTROL_TYPE_ORDER[a.sortType] - CONTROL_TYPE_ORDER[b.sortType]
      if (typeOrder !== 0) return typeOrder
      return a.position.localeCompare(b.position, undefined, { numeric: true })
    })
    .map(({ control, position, status }) => ({ control, position, status }))
}
