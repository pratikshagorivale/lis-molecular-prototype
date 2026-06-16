import type { RawMolecularRow } from './parseMolecularFile'
import { isControlSample } from '../data/lisSampleRegistry'
import { hasAmplifiedCt, isAmpStatusDetected, isPositiveResult } from './interpretation'
import { normalizeWell } from './wellPosition'
import type { FailedControlWell } from '../types'

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
  if (/^PC$|POS|POSITIVE/.test(v)) return 'PC'
  if (/^NC$|NEG|NEGATIVE/.test(v)) return 'NC'
  if (/NTC|NO TEMPLATE/.test(v)) return 'NTC'
  if (/^IC$|INTERNAL/.test(v)) return 'IC'
  if (v === 'QC' || v.includes('CONTROL')) return v.includes('POSITIVE') ? 'PC' : v.includes('NEGATIVE') ? 'NC' : 'QC'
  return v
}

export function isControlRecord(row: Pick<RawMolecularRow, 'sampleId' | 'isQc' | 'qcType'>): boolean {
  if (row.isQc) return true
  if (row.qcType && isQcFlag(row.qcType)) return true
  if (row.qcType && ['PC', 'NC', 'NTC', 'IC', 'QC'].includes(row.qcType.toUpperCase())) return true
  return isControlSample(row.sampleId)
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
    qc === 'PC' || /^POS/.test(qc) || sample === 'PC'
    || (isControl && (/POSITIVE CONTROL/.test(target) || /^PC[-/]/.test(target)))
  ) {
    return 'PC'
  }
  if (qc === 'NC' || /^NEG/.test(qc) || sample === 'NC' || (isControl && /NEGATIVE CONTROL/.test(target))) {
    return 'NC'
  }
  return null
}

export function isControlDetected(row: Pick<RawMolecularRow, 'interpretation' | 'ampStatus' | 'ct'>): boolean {
  if (isAmpStatusDetected(row.ampStatus)) return true
  if (hasAmplifiedCt(row.ct)) return true
  if (row.interpretation === 'Detected' || row.interpretation === 'Passed') return true
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
