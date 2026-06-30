import type { RawMolecularRow } from './parseMolecularFile'
import { isControlSample } from '../data/lisSampleRegistry'
import { hasAmplifiedCt, isAmpStatusDetected, isAmpStatusNotDetected, isPositiveResult } from './interpretation'
import { normalizeWell } from './wellPosition'
import type { FailedControlWell, InstrumentControlConfig, WellControlValidation, WellData } from '../types'

const QC_FLAG_VALUES = new Set(['Y', 'YES', 'TRUE', '1', 'QC', 'CONTROL'])

export type ControlType = 'PC' | 'NC' | 'NTC' | 'IC'

export interface ControlTypeResult {
  present: boolean
  passed: boolean
}

export interface PlateQcEvaluation {
  pc: ControlTypeResult
  nc: ControlTypeResult
  ntc: ControlTypeResult
  ic: ControlTypeResult
  qcPassed: boolean
  failedControlWells: FailedControlWell[]
  status: 'QC Passed' | 'Failed' | 'Needs Review'
}

export function isQcFlag(value: unknown): boolean {
  const v = String(value ?? '').trim().toUpperCase()
  if (!v) return false
  return QC_FLAG_VALUES.has(v)
}

export function parseQcType(value: unknown): string {
  const v = String(value ?? '').trim().toUpperCase()
  if (!v) return ''
  if (/^PC\b|^PC$|POS|POSITIVE/.test(v)) return 'PC'
  if (/^NC\b|^NC$|NEG|NEGATIVE/.test(v)) return 'NC'
  if (/^NTC\b|NTC|NO TEMPLATE/.test(v)) return 'NTC'
  if (/^IC\b|^IC$|INTERNAL/.test(v)) return 'IC'
  if (v === 'QC' || v.includes('CONTROL')) return v.includes('POSITIVE') ? 'PC' : v.includes('NEGATIVE') ? 'NC' : 'QC'
  return v
}

export function isControlRecord(row: Pick<RawMolecularRow, 'sampleId' | 'isQc' | 'qcType'>): boolean {
  if (row.isQc) return true
  if (row.qcType && isQcFlag(row.qcType)) return true
  if (row.qcType && ['PC', 'NC', 'NTC', 'IC', 'QC'].includes(row.qcType.toUpperCase())) return true
  return isControlSample(row.sampleId)
}

/** Sample IDs like "PC E", "NC KP" — per-target controls in the results file. */
export function isPlateStyleControlId(sampleId: string): boolean {
  return /^(PC|NC|NTC|IC)$/i.test(sampleId.trim())
}

export function isTargetStyleControlId(sampleId: string): boolean {
  const trimmed = sampleId.trim()
  if (!/^(PC|NC|NTC|IC)\b/i.test(trimmed)) return false
  return !isPlateStyleControlId(trimmed)
}

export function controlLabel(row: Pick<RawMolecularRow, 'qcType' | 'sampleId' | 'target'>): string {
  const sampleId = row.sampleId?.trim()
  if (sampleId) return sampleId
  if (row.qcType) return row.qcType
  if (isControlSample(row.sampleId)) return row.sampleId
  return row.target || 'QC'
}

export function classifyControlType(
  row: Pick<RawMolecularRow, 'qcType' | 'sampleId' | 'target' | 'isQc'>,
): ControlType | null {
  const qc = (row.qcType || '').trim().toUpperCase()
  const sample = (row.sampleId || '').trim().toUpperCase()
  const target = (row.target || '').trim().toUpperCase()
  const isControl = isControlRecord(row)

  if (qc === 'IC' || sample === 'IC' || (isControl && (/\bINTERNAL CONTROL\b/.test(target) || target === 'IC'))) {
    return 'IC'
  }
  if (/NTC|NO TEMPLATE/.test(qc) || sample === 'NTC' || (isControl && /NO TEMPLATE/.test(target))) {
    return 'NTC'
  }
  if (
    qc === 'PC' || /^POS/.test(qc) || sample === 'PC' || /^PC\b/.test(sample)
    || (isControl && (/POSITIVE CONTROL/.test(target) || /^PC[-/]/.test(target)))
  ) {
    return 'PC'
  }
  if (qc === 'NC' || /^NEG/.test(qc) || sample === 'NC' || /^NC\b/.test(sample) || (isControl && /NEGATIVE CONTROL/.test(target))) {
    return 'NC'
  }
  return null
}

export function isControlDetected(row: Pick<RawMolecularRow, 'interpretation' | 'ampStatus' | 'ct'>): boolean {
  if (row.interpretation === 'Not Detected') return false
  if (row.ampStatus?.trim() && isAmpStatusNotDetected(row.ampStatus)) return false

  if (isAmpStatusDetected(row.ampStatus)) return true
  if (row.interpretation === 'Detected' || row.interpretation === 'Passed') return true
  if (hasAmplifiedCt(row.ct)) return true
  return isPositiveResult(row.interpretation, row.ampStatus, row.ct)
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

export function isControlNotDetected(row: Pick<RawMolecularRow, 'interpretation' | 'ampStatus' | 'ct'>): boolean {
  if (row.interpretation === 'Not Detected') return true
  if (row.interpretation === 'Passed') return true
  if (row.ampStatus?.trim() && isAmpStatusNotDetected(row.ampStatus)) return true
  if (row.interpretation === 'Detected') return false
  if (row.ampStatus?.trim() && isAmpStatusDetected(row.ampStatus)) return false
  return !isPositiveResult(row.interpretation, row.ampStatus, row.ct)
}

export function controlRecordPassed(row: RawMolecularRow): boolean {
  const type = classifyControlType(row)
  if (!type) return false
  if (type === 'PC' || type === 'IC') return isControlDetected(row)
  return isControlNotDetected(row)
}

export function evaluateControlsOfType(
  records: RawMolecularRow[],
  type: ControlType,
): ControlTypeResult {
  const byWell = new Map<string, RawMolecularRow[]>()
  for (const row of records) {
    const wellId = normalizeWell(row.well)
    if (!wellId) continue
    const list = byWell.get(wellId) ?? []
    list.push(row)
    byWell.set(wellId, list)
  }

  const wellsOfType: RawMolecularRow[][] = []
  for (const rows of byWell.values()) {
    const enriched = enrichWellControlRows(rows)
    if (!enriched.some((r) => isControlRecord(r))) continue
    if (resolveWellControlType(enriched) === type) wellsOfType.push(enriched)
  }

  if (wellsOfType.length === 0) return { present: false, passed: false }
  const passed = wellsOfType.every((rows) => wellControlRowsPass(rows, type))
  return { present: true, passed }
}

function wellControlRowsPass(rows: RawMolecularRow[], type: ControlType): boolean {
  return type === 'PC' || type === 'IC'
    ? rows.every(isControlDetected)
    : rows.every(isControlNotDetected)
}

const CONTROL_TYPE_ORDER: Record<ControlType, number> = { PC: 0, NC: 1, NTC: 2, IC: 3 }

export function getPlateControlValidations(
  records: RawMolecularRow[],
): { control: string; position: string; status: 'Pass' | 'Fail' }[] {
  const byWell = new Map<string, RawMolecularRow[]>()

  for (const row of records) {
    const wellId = normalizeWell(row.well)
    if (!wellId) continue
    const list = byWell.get(wellId) ?? []
    list.push(row)
    byWell.set(wellId, list)
  }

  const validations: { control: string; position: string; status: 'Pass' | 'Fail'; sortType: ControlType }[] = []

  for (const [wellId, rawRows] of byWell) {
    const rows = enrichWellControlRows(rawRows)
    const type = resolveWellControlType(rows)
    if (!type || !rows.some((r) => isControlRecord(r))) continue
    const first = rows.find((r) => r.sampleId.trim()) ?? rows[0]
    validations.push({
      control: first.sampleId.trim() || controlLabel(first),
      position: wellId,
      status: wellControlRowsPass(rows, type) ? 'Pass' : 'Fail',
      sortType: type,
    })
  }

  return validations
    .sort((a, b) => {
      const typeOrder = CONTROL_TYPE_ORDER[a.sortType] - CONTROL_TYPE_ORDER[b.sortType]
      if (typeOrder !== 0) return typeOrder
      return a.position.localeCompare(b.position, undefined, { numeric: true })
    })
    .map(({ control, position, status }) => ({ control, position, status }))
}

export function isPlateControlWell(
  well: Pick<WellData, 'status' | 'isQc' | 'panel' | 'qcType' | 'sampleId'>,
): boolean {
  if (well.status === 'empty') return false
  return (
    well.status === 'control'
    || well.isQc
    || well.panel === 'Control'
    || !!well.qcType
    || /^(PC|NC|NTC|IC)\b/i.test(well.sampleId?.trim() || '')
  )
}

function controlIdSortOrder(controlId: string): number {
  const id = controlId.trim().toUpperCase()
  if (id === 'PC') return CONTROL_TYPE_ORDER.PC
  if (id === 'NC') return CONTROL_TYPE_ORDER.NC
  if (id === 'NTC') return CONTROL_TYPE_ORDER.NTC
  if (id === 'IC') return CONTROL_TYPE_ORDER.IC
  return 99
}

const CONTROL_TYPE_TO_CONFIG: Record<ControlType, InstrumentControlConfig['controlType']> = {
  PC: 'Positive Control',
  NC: 'Negative Control',
  NTC: 'NTC',
  IC: 'Internal Control',
}

function controlTypeFromId(control: string): ControlType | null {
  const id = control.trim().toUpperCase()
  if (/^PC\b/.test(id) || id === 'PC') return 'PC'
  if (/^NC\b/.test(id) || id === 'NC') return 'NC'
  if (/^NTC\b/.test(id) || id === 'NTC') return 'NTC'
  if (/^IC\b/.test(id) || id === 'IC') return 'IC'
  return null
}

function isTargetedFailTarget(
  controlType: ControlType,
  instrumentControls: InstrumentControlConfig[],
): boolean {
  const config = instrumentControls.find(
    (c) => c.controlType === CONTROL_TYPE_TO_CONFIG[controlType] && c.scope === 'targeted',
  )
  return config?.targetedFailureBehavior === 'fail-target'
}

export function aggregateControlValidationsByType(
  validations: WellControlValidation[],
): WellControlValidation[] {
  const groups = new Map<string, WellControlValidation[]>()

  for (const row of validations) {
    const type = controlTypeFromId(row.control)
    const key = type ?? row.control.trim().toUpperCase()
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  return [...groups.entries()]
    .map(([, rows]) => ({
      control: controlTypeFromId(rows[0].control) ?? rows[0].control,
      position: rows
        .map((r) => r.position)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .join(', '),
      status: (rows.some((r) => r.status === 'Fail') ? 'Fail' : 'Pass') as 'Pass' | 'Fail',
    }))
    .sort((a, b) => controlIdSortOrder(a.control) - controlIdSortOrder(b.control))
}

export function controlValidationsForWell(
  well: WellData,
  plateWells: WellData[],
  instrumentControls: InstrumentControlConfig[] = [],
): WellControlValidation[] {
  const perWell = controlValidationsFromPlateWells(plateWells)

  if (isPlateControlWell(well)) {
    return perWell.filter((row) => row.position === well.wellId)
  }

  const aggregated = aggregateControlValidationsByType(perWell)

  return aggregated.filter((row) => {
    const type = controlTypeFromId(row.control)
    if (!type) return false

    const failed = row.status === 'Fail'

    if (type === 'PC') {
      if (!failed) return true
      if (isTargetedFailTarget('PC', instrumentControls)) {
        return Boolean(well.affectedByTargetedControlFailure)
      }
      return true
    }

    if (type === 'NC' || type === 'NTC' || type === 'IC') {
      return true
    }

    return failed
  })
}

/** Derive control validation rows from mapped plate wells (always current UI shape). */
export function controlValidationsFromPlateWells(plateWells: WellData[]): WellControlValidation[] {
  return plateWells
    .filter(isPlateControlWell)
    .map((well) => ({
      control: well.sampleId?.trim() || well.label?.trim() || well.qcType || 'QC',
      position: well.wellId,
      status: (well.controlFailed ? 'Fail' : 'Pass') as 'Pass' | 'Fail',
    }))
    .sort((a, b) => {
      const typeOrder = controlIdSortOrder(a.control) - controlIdSortOrder(b.control)
      if (typeOrder !== 0) return typeOrder
      return a.position.localeCompare(b.position, undefined, { numeric: true })
    })
}

export function getFailedControlWells(records: RawMolecularRow[]): FailedControlWell[] {
  const byWell = new Map<string, RawMolecularRow[]>()

  for (const row of records) {
    const wellId = normalizeWell(row.well)
    if (!wellId) continue
    const list = byWell.get(wellId) ?? []
    list.push(row)
    byWell.set(wellId, list)
  }

  const failed: FailedControlWell[] = []
  for (const [wellId, rawRows] of byWell) {
    const rows = enrichWellControlRows(rawRows)
    const type = resolveWellControlType(rows)
    if (!type || !rows.some((r) => isControlRecord(r))) continue
    if (wellControlRowsPass(rows, type)) continue
    const first = rows.find((r) => r.sampleId.trim()) ?? rows[0]
    failed.push({
      wellId,
      controlType: type,
      sampleId: first.sampleId.trim() || controlLabel(first),
      label: controlLabel(first),
    })
  }

  return failed.sort((a, b) => a.wellId.localeCompare(b.wellId, undefined, { numeric: true }))
}

export function evaluatePlateQc(records: RawMolecularRow[]): PlateQcEvaluation {
  const pc = evaluateControlsOfType(records, 'PC')
  const nc = evaluateControlsOfType(records, 'NC')
  const ntc = evaluateControlsOfType(records, 'NTC')
  const ic = evaluateControlsOfType(records, 'IC')
  const failedControlWells = getFailedControlWells(records)

  // PC and NC are required. NTC and IC are ignored when not present in the file.
  const coreRequired = [pc, nc]
  const optionalWhenPresent = [ntc, ic]

  const qcPassed =
    coreRequired.every((t) => t.present && t.passed)
    && optionalWhenPresent.every((t) => !t.present || t.passed)

  let status: PlateQcEvaluation['status']
  if (qcPassed) {
    status = 'QC Passed'
  } else if (
    coreRequired.some((t) => t.present && !t.passed)
    || optionalWhenPresent.some((t) => t.present && !t.passed)
  ) {
    status = 'Failed'
  } else {
    status = 'Needs Review'
  }

  return { pc, nc, ntc, ic, qcPassed, failedControlWells, status }
}

/** @deprecated Use evaluateControlsOfType */
export function evaluateControlType(
  controlRecords: RawMolecularRow[],
  pattern: RegExp,
): ControlTypeResult {
  const type: ControlType | null =
    /NTC/i.test(pattern.source) ? 'NTC'
      : /NC|NEG/i.test(pattern.source) ? 'NC'
        : /IC|INTERNAL/i.test(pattern.source) ? 'IC'
          : /PC|POS/i.test(pattern.source) ? 'PC'
            : null
  if (!type) return { present: false, passed: false }
  return evaluateControlsOfType(controlRecords, type)
}
