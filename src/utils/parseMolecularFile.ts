import * as XLSX from 'xlsx'
import { buildValidationData } from '../data/buildValidationData'
import { loadLisRegistry } from '../data/lisSampleRegistry'
import { normalizeAmpStatusCell, resolveRowInterpretation } from './interpretation'
import { isControlRecord, isQcFlag, parseQcType } from './qcDetection'
import { combineRowCol, normalizeWell } from './wellPosition'
import type { FieldMapping, FileParseContext, InstrumentControlConfig, Interpretation, MappedTargetMetrics, MappingTargetKey, ParsedUploadData, PlateSize, PlateViewReadiness, TargetType, UserFieldMapping } from '../types'

export interface RawMolecularRow {
  well: string
  sampleId: string
  patient: string
  testOrder: string
  panel: string
  isQc: boolean
  qcType: string
  target: string
  ct: string | number
  viralLoad: string
  interpretation: Interpretation
  interpretationValue?: string
  ampStatus: string
  type: TargetType
  plateId?: string
  accessionNumber?: string
  ampScore?: string
  cqConfidence?: string
  reporterDye?: string
  thresholdValue?: string
}

export const MAPPING_FIELD_DEFS: { key: MappingTargetKey; label: string; required: boolean }[] = [
  { key: 'well', label: 'Well Position', required: false },
  { key: 'sampleId', label: 'Sample ID', required: true },
  { key: 'target', label: 'Target Name', required: true },
  { key: 'result', label: 'Result', required: true },
  { key: 'interpretation', label: 'Interpretation', required: false },
  { key: 'ampStatus', label: 'Amp Status', required: false },
  { key: 'viralLoad', label: 'Viral Load', required: false },
  { key: 'plateId', label: 'Plate ID', required: false },
  { key: 'thresholdValue', label: 'Threshold Value', required: false },
  { key: 'reporterDye', label: 'Reporter Dye', required: false },
  { key: 'cqConfidence', label: 'Cq Confidence', required: false },
]

const COLUMN_ALIASES: Record<MappingTargetKey, string[]> = {
  well: ['well', 'well position', 'well id', 'wellposition', 'position', 'well_pos', 'well location'],
  sampleId: ['sample name', 'sample id', 'sampleid', 'sample', 'specimen id', 'accession', 'accession id', 'sample_id', 'specimen', 'sample no', 'sample number'],
  target: ['target', 'target name', 'parameter', 'gene', 'organism', 'analyte', 'target_name', 'assay', 'pathogen', 'target/gene'],
  result: ['result', 'ct', 'ct value', 'cq', 'ct_value', 'ct (drn)', 'cq value', 'threshold cycle', 'result 1', 'result_1'],
  interpretation: [
    'interpretation', 'call', 'result interpretation', 'qualitative', 'detection call',
    'detected', 'detection status', 'result call',
  ],
  ampStatus: [
    'amp status', 'ampstatus', 'amp status result', 'amplification status', 'amp result',
    'amplification result', 'amp call', 'amp st', 'amp.',
  ],
  viralLoad: ['viral load', 'viralload', 'vl', 'copies', 'copies/ml', 'iu/ml', 'log copies'],
  plateId: ['plate', 'plate id', 'plate_id', 'plateid'],
  thresholdValue: ['threshold value', 'threshold', 'auto threshold'],
  reporterDye: ['reporter dye', 'reporter', 'fluorophore', 'dye'],
  cqConfidence: ['cq confidence', 'ct confidence', 'confidence', 'cq conf'],
}

type AutoColumnKey = 'testOrder' | 'isQc' | 'qcType' | 'type' | 'patient' | 'panel'
type AutoMetricKey = 'accessionNumber' | 'ampScore'

const AUTO_METRIC_ALIASES: Record<AutoMetricKey, string[]> = {
  accessionNumber: ['accession number', 'accession no', 'accession #', 'accession id', 'accession'],
  ampScore: ['amp score', 'amplification score', 'amp_score'],
}

const AUTO_COLUMN_ALIASES: Record<AutoColumnKey, string[]> = {
  testOrder: ['test order', 'test order id', 'test order no', 'test order number', 'order id', 'order number', 'order no', 'accession order', 'accession no', 'accession number', 'lab order', 'lab order id', 'bill id', 'test id'],
  isQc: ['is qc', 'isqc', 'is control', 'control flag', 'qc flag', 'qc?'],
  qcType: ['qc sample', 'qc type', 'control type', 'control name', 'control'],
  type: ['type', 'target type', 'target_type', 'category'],
  patient: ['patient name', 'patient', 'patientname', 'pat name', 'pt name', 'patient id', 'patient details'],
  panel: ['panel', 'test name', 'test panel', 'assay panel', 'panel name', 'test details'],
}

export function mappingsReadyForPreview(mappings: UserFieldMapping[]): boolean {
  return mappings.filter((m) => m.required).every((m) => m.sourceColumn)
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function findColumnByName(headers: string[], sourceColumns: string[], name: string): number {
  if (!name) return -1
  const normalized = normalizeHeader(name)
  return headers.findIndex((h, i) => h === normalized || sourceColumns[i] === name)
}

const SAMPLE_ID_COLUMN_PRIORITY = [
  'sample name',
  'sample id',
  'sampleid',
  'accession id',
  'accession',
  'specimen id',
  'sample no',
  'sample number',
  'sample',
  'specimen',
]

function findSampleIdColumn(headers: string[], usedIndices: Set<number>): number {
  for (const alias of SAMPLE_ID_COLUMN_PRIORITY) {
    const idx = headers.findIndex((h, i) => {
      if (usedIndices.has(i)) return false
      if (h === alias) return true
      return alias.length >= 5 && h.includes(alias)
    })
    if (idx >= 0) return idx
  }
  return -1
}

function resolveSampleId(
  row: unknown[],
  sampleIdx: number,
  headers: string[],
): string {
  const candidateIndices: number[] = []
  if (sampleIdx >= 0) candidateIndices.push(sampleIdx)
  for (const alias of SAMPLE_ID_COLUMN_PRIORITY) {
    const idx = headers.findIndex((h, i) => {
      if (candidateIndices.includes(i)) return false
      if (h === alias) return true
      return alias.length >= 5 && h.includes(alias)
    })
    if (idx >= 0) candidateIndices.push(idx)
  }

  for (const idx of candidateIndices) {
    const value = String(row[idx] ?? '').trim()
    if (value) return value
  }
  return ''
}

function autoDetectSourceColumn(
  key: MappingTargetKey,
  headers: string[],
  sourceColumns: string[],
  usedIndices: Set<number>,
): string {
  if (key === 'sampleId') {
    const idx = findSampleIdColumn(headers, usedIndices)
    if (idx >= 0) {
      usedIndices.add(idx)
      return sourceColumns[idx]
    }
    return ''
  }

  const aliases = COLUMN_ALIASES[key]
  let idx = headers.findIndex((h, i) => !usedIndices.has(i) && aliases.some((a) => h === a))
  if (idx < 0) {
    idx = headers.findIndex((h, i) => {
      if (usedIndices.has(i)) return false
      return aliases.some((a) => {
        if (a.length <= 2) return h === a
        return h === a || h.includes(a)
      })
    })
  }
  if (idx >= 0) usedIndices.add(idx)
  return idx >= 0 ? sourceColumns[idx] : ''
}

function findAutoColumnIndex(headers: string[], key: AutoColumnKey, excludeIndices: Set<number> = new Set()): number {
  const idx = findColumnByAliases(headers, AUTO_COLUMN_ALIASES[key], excludeIndices)
  if (idx < 0 && key === 'qcType') {
    return headers.findIndex((h, i) => !excludeIndices.has(i) && h === 'qc')
  }
  return idx
}

function findColumnByAliases(headers: string[], aliases: string[], excludeIndices: Set<number> = new Set()): number {
  let idx = headers.findIndex((h, i) => !excludeIndices.has(i) && aliases.some((a) => h === a))
  if (idx < 0) {
    idx = headers.findIndex((h, i) => {
      if (excludeIndices.has(i)) return false
      return aliases.some((a) => {
        if (a.length <= 2) return h === a
        return h === a || h.includes(a)
      })
    })
  }
  return idx
}

function readOptionalMetric(row: unknown[], idx: number | undefined): string {
  if (idx == null || idx < 0) return ''
  const value = row[idx]
  if (value == null || value === '') return ''
  return String(value).trim()
}

export function createAutoMappings(headers: string[], sourceColumns: string[]): UserFieldMapping[] {
  const usedIndices = new Set<number>()
  return MAPPING_FIELD_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    required: def.required,
    sourceColumn: autoDetectSourceColumn(def.key, headers, sourceColumns, usedIndices),
  }))
}

export function mappingsNeedSync(mappings: UserFieldMapping[]): boolean {
  if (mappings.length !== MAPPING_FIELD_DEFS.length) return true
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping]))
  return MAPPING_FIELD_DEFS.some((def) => {
    const existing = byKey.get(def.key)
    return !existing || existing.label !== def.label || existing.required !== def.required
  })
}

export function buildMappedTargetMetrics(mappings: UserFieldMapping[]): MappedTargetMetrics {
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping]))
  return {
    thresholdValue: !!byKey.get('thresholdValue')?.sourceColumn,
    reporterDye: !!byKey.get('reporterDye')?.sourceColumn,
    cqConfidence: !!byKey.get('cqConfidence')?.sourceColumn,
  }
}

export function syncUserMappingsWithFieldDefs(mappings: UserFieldMapping[]): UserFieldMapping[] {
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping]))

  // Before ampStatus existed, interpretation carried the Amp Status column mapping.
  if (!byKey.has('ampStatus') && byKey.has('interpretation')) {
    const legacyInterpretation = byKey.get('interpretation')!
    if (legacyInterpretation.sourceColumn) {
      byKey.set('ampStatus', {
        key: 'ampStatus',
        label: 'Amp Status',
        required: false,
        sourceColumn: legacyInterpretation.sourceColumn,
      })
      byKey.set('interpretation', {
        key: 'interpretation',
        label: 'Interpretation',
        required: false,
        sourceColumn: '',
      })
    }
  }

  return MAPPING_FIELD_DEFS.map((def) => {
    const existing = byKey.get(def.key)
    return {
      key: def.key,
      label: def.label,
      required: def.required,
      sourceColumn: existing?.sourceColumn ?? '',
    }
  })
}

function detectHeaderRow(rows: unknown[][]): number {
  let bestIdx = 0
  let bestScore = 0
  const keywords = ['well', 'sample', 'patient', 'order', 'target', 'parameter', 'ct', 'result', 'interpretation', 'amp', 'qc']

  rows.slice(0, 25).forEach((row, idx) => {
    const text = row.map((c) => normalizeHeader(c)).join(' ')
    const score = keywords.filter((k) => text.includes(k)).length
    if (score > bestScore) {
      bestScore = score
      bestIdx = idx
    }
  })
  return bestIdx
}

function inferType(target: string, explicit?: string): TargetType {
  if (explicit) {
    const t = explicit.toLowerCase()
    if (t.includes('control')) return 'Control'
    if (t.includes('gene')) return 'Gene'
    if (t.includes('organism')) return 'Organism'
  }
  const lower = target.toLowerCase()
  if (lower.includes('control') || lower === 'ntc') return 'Control'
  if (/^bla|^van|^mec|gene|resistance/i.test(target)) return 'Gene'
  return 'Organism'
}

export function parseMetadataFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '')
  const match = base.match(/^([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d{1,2}[A-Za-z]{3}\d{4})_([A-Za-z0-9]+)/i)
  if (match) {
    const [, device, panel, dateRaw, plateId] = match
    const day = dateRaw.slice(0, dateRaw.length - 7)
    const month = dateRaw.slice(day.length, dateRaw.length - 4)
    const year = dateRaw.slice(-4)
    const months: Record<string, string> = {
      JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun',
      JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec',
    }
    const runDate = `${day} ${months[month.toUpperCase()] ?? month} ${year}`
    return {
      device: device.toUpperCase(),
      plateId: plateId.toUpperCase(),
      runDate,
      defaultPanel: panel.toUpperCase().includes('UTI') ? 'UTI Panel' : `${panel} Panel`,
    }
  }
  return {
    device: 'QS5',
    plateId: 'AB1P',
    runDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    defaultPanel: 'UTI Panel',
  }
}

function sheetToRows(workbook: XLSX.WorkBook): unknown[][] {
  const sheetName = workbook.SheetNames.find((n) => /result|data|sheet|uti|molecular/i.test(n)) ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
}

function buildRawText(sourceColumns: string[], dataRows: unknown[][]): string {
  const lines = [
    sourceColumns.join(','),
    ...dataRows.slice(0, 50).map((r) => (r as unknown[]).map((c) => String(c)).join(',')),
  ]
  if (dataRows.length > 50) lines.push(`... ${dataRows.length - 50} more rows`)
  return lines.join('\n')
}

function dataRowsFromContext(context: Pick<FileParseContext, 'rawRows' | 'dataStartRowIndex'>): unknown[][] {
  return context.rawRows
    .slice(context.dataStartRowIndex)
    .filter((r) => r.some((c) => String(c).trim()))
}

function buildContextColumns(
  rawRows: unknown[][],
  headerRowIndex: number,
  dataStartRowIndex: number,
): Pick<FileParseContext, 'headerRowIndex' | 'dataStartRowIndex' | 'sourceColumns' | 'rawText'> {
  const headerRow = rawRows[headerRowIndex] ?? []
  const sourceColumns = headerRow.map((h) => String(h ?? '').trim())
  const dataRows = rawRows.slice(dataStartRowIndex).filter((r) => r.some((c) => String(c).trim()))
  return {
    headerRowIndex,
    dataStartRowIndex,
    sourceColumns,
    rawText: buildRawText(sourceColumns, dataRows),
  }
}

/** Update header / data-start rows (1-based row numbers as shown in Excel). */
export function updateFileContextRowSettings(
  context: FileParseContext,
  settings: { headerRow?: number; dataStartRow?: number },
): FileParseContext {
  const maxRow = context.rawRows.length
  let headerRowIndex = settings.headerRow != null
    ? Math.max(0, Math.min(settings.headerRow - 1, Math.max(0, maxRow - 1)))
    : context.headerRowIndex
  let dataStartRowIndex = settings.dataStartRow != null
    ? Math.max(0, Math.min(settings.dataStartRow - 1, Math.max(0, maxRow - 1)))
    : context.dataStartRowIndex

  if (dataStartRowIndex <= headerRowIndex) {
    dataStartRowIndex = Math.min(headerRowIndex + 1, Math.max(0, maxRow - 1))
  }

  return {
    ...context,
    ...buildContextColumns(context.rawRows, headerRowIndex, dataStartRowIndex),
  }
}

export async function readSpreadsheetFile(file: File): Promise<FileParseContext> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const rawRows = sheetToRows(workbook)
  const headerRowIndex = detectHeaderRow(rawRows)
  const dataStartRowIndex = Math.min(headerRowIndex + 1, Math.max(0, rawRows.length - 1))
  const metadata = parseMetadataFromFileName(file.name)

  return {
    fileName: file.name,
    rawRows,
    metadata,
    ...buildContextColumns(rawRows, headerRowIndex, dataStartRowIndex),
  }
}

function mappingsToFieldMappings(userMappings: UserFieldMapping[]): FieldMapping[] {
  return userMappings
    .filter((m) => m.sourceColumn)
    .map((m) => ({
      source: m.sourceColumn,
      target: m.label,
      status: 'Mapped' as const,
    }))
}

function getColumnIndex(userMappings: UserFieldMapping[], key: MappingTargetKey, headers: string[], sourceColumns: string[]): number {
  const mapping = userMappings.find((m) => m.key === key)
  if (!mapping?.sourceColumn) return -1
  return findColumnByName(headers, sourceColumns, mapping.sourceColumn)
}

function resolveAmpStatusColumnIndex(
  mappedIdx: number,
  headers: string[],
): number {
  if (mappedIdx >= 0) return mappedIdx
  const patterns = ['amp status', 'ampstatus', 'amp st', 'amplification status', 'amp result']
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => h === pattern || h.includes(pattern))
    if (idx >= 0) return idx
  }
  return -1
}

export function recordsFromMappings(
  context: FileParseContext,
  userMappings: UserFieldMapping[],
): RawMolecularRow[] {
  const headerRow = context.rawRows[context.headerRowIndex] ?? []
  const sourceColumns = headerRow.map((h) => String(h ?? '').trim())
  const headers = sourceColumns.map((h) => normalizeHeader(h))
  const dataRows = dataRowsFromContext(context)

  const wellIdx = getColumnIndex(userMappings, 'well', headers, sourceColumns)
  const sampleIdx = getColumnIndex(userMappings, 'sampleId', headers, sourceColumns)
  const targetIdx = getColumnIndex(userMappings, 'target', headers, sourceColumns)
  const resultIdx = getColumnIndex(userMappings, 'result', headers, sourceColumns)
  const viralLoadIdx = getColumnIndex(userMappings, 'viralLoad', headers, sourceColumns)
  const interpretationUserIdx = getColumnIndex(userMappings, 'interpretation', headers, sourceColumns)
  const interpretationMapped = interpretationUserIdx >= 0
  const ampStatusIdx = resolveAmpStatusColumnIndex(
    getColumnIndex(userMappings, 'ampStatus', headers, sourceColumns),
    headers,
  )
  const plateIdx = getColumnIndex(userMappings, 'plateId', headers, sourceColumns)
  const thresholdValueIdx = getColumnIndex(userMappings, 'thresholdValue', headers, sourceColumns)
  const reporterDyeIdx = getColumnIndex(userMappings, 'reporterDye', headers, sourceColumns)
  const cqConfidenceIdx = getColumnIndex(userMappings, 'cqConfidence', headers, sourceColumns)

  const autoExclude = new Set(
    [
      wellIdx, sampleIdx, targetIdx, resultIdx, viralLoadIdx, interpretationUserIdx, ampStatusIdx, plateIdx,
      thresholdValueIdx, reporterDyeIdx, cqConfidenceIdx,
    ].filter((i) => i >= 0),
  )
  const patientIdx = findAutoColumnIndex(headers, 'patient', autoExclude)
  if (patientIdx >= 0) autoExclude.add(patientIdx)
  const panelIdx = findAutoColumnIndex(headers, 'panel', autoExclude)
  if (panelIdx >= 0) autoExclude.add(panelIdx)
  const testOrderIdx = findAutoColumnIndex(headers, 'testOrder', autoExclude)
  if (testOrderIdx >= 0) autoExclude.add(testOrderIdx)
  const isQcIdx = findAutoColumnIndex(headers, 'isQc', autoExclude)
  if (isQcIdx >= 0) autoExclude.add(isQcIdx)
  const qcTypeIdx = findAutoColumnIndex(headers, 'qcType', autoExclude)
  if (qcTypeIdx >= 0) autoExclude.add(qcTypeIdx)
  const typeIdx = findAutoColumnIndex(headers, 'type', autoExclude)
  const metricIdx: Partial<Record<AutoMetricKey, number>> = {}
  for (const key of Object.keys(AUTO_METRIC_ALIASES) as AutoMetricKey[]) {
    const idx = findColumnByAliases(headers, AUTO_METRIC_ALIASES[key], autoExclude)
    if (idx >= 0) {
      metricIdx[key] = idx
      autoExclude.add(idx)
    }
  }
  const rowIdx = headers.findIndex((h) => ['row', 'plate row'].includes(h))
  const colIdx = headers.findIndex((h) => ['col', 'column', 'plate column'].includes(h))

  const hasWellColumn = wellIdx >= 0
  const hasRowCol = rowIdx >= 0 && colIdx >= 0
  const missing = userMappings
    .filter((m) => m.required && !m.sourceColumn)
    .map((m) => m.label)
  if (missing.length) {
    throw new Error(`Required fields not mapped: ${missing.join(', ')}`)
  }
  if (sampleIdx === -1 || targetIdx === -1 || resultIdx === -1) {
    throw new Error('Could not resolve Sample ID, Target Name, and Result columns from mappings.')
  }

  const records: RawMolecularRow[] = []
  for (const row of dataRows) {
    const well = hasWellColumn
      ? normalizeWell(row[wellIdx])
      : hasRowCol
        ? combineRowCol(row[rowIdx], row[colIdx])
        : ''
    const isQcRaw = isQcIdx >= 0 ? row[isQcIdx] : ''
    const qcTypeRaw = qcTypeIdx >= 0 ? row[qcTypeIdx] : ''
    let qcType = parseQcType(qcTypeRaw)
    let isQc = isQcFlag(isQcRaw) || (!!qcType && ['PC', 'NC', 'NTC', 'IC', 'QC'].includes(qcType))

    let sampleId = resolveSampleId(row, sampleIdx, headers)
    const target = String(row[targetIdx] ?? '').trim()
    if (!target) continue

    if (sampleId) {
      const typeFromSample = parseQcType(sampleId)
      if (!isQc && typeFromSample && ['PC', 'NC', 'NTC', 'IC'].includes(typeFromSample)) {
        isQc = true
        qcType = typeFromSample
      } else if (isQc && typeFromSample && typeFromSample !== 'QC' && (!qcType || qcType === 'QC')) {
        qcType = typeFromSample
      }
    }

    if (!sampleId) {
      if (isQc && qcType && qcType !== 'QC') sampleId = qcType
      else if (!isQc) continue
      else sampleId = 'QC'
    }

    const patient = patientIdx >= 0 ? String(row[patientIdx] ?? '').trim() : ''
    const testOrder = testOrderIdx >= 0 ? String(row[testOrderIdx] ?? '').trim() : ''
    const panel = panelIdx >= 0 ? String(row[panelIdx] ?? '').trim() : ''
    const ctRaw = row[resultIdx]
    const ct = ctRaw === '' || ctRaw == null ? '-' : (typeof ctRaw === 'number' ? ctRaw : String(ctRaw).trim())
    const viralLoad = viralLoadIdx >= 0 ? String(row[viralLoadIdx] ?? '').trim() : ''
    const interpretationColRaw = interpretationMapped
      ? normalizeAmpStatusCell(row[interpretationUserIdx])
      : ''
    const ampStatusColRaw = ampStatusIdx >= 0 ? normalizeAmpStatusCell(row[ampStatusIdx]) : ''
    const ampStatus = ampStatusColRaw.trim()
    const typeRaw = typeIdx >= 0 ? String(row[typeIdx] ?? '') : ''
    const plateId = plateIdx >= 0
      ? String(row[plateIdx] ?? '').trim() || context.metadata.plateId
      : context.metadata.plateId
    const accessionNumber = readOptionalMetric(row, metricIdx.accessionNumber) || testOrder

    const { interpretation, interpretationValue } = resolveRowInterpretation(ct, {
      mappedRaw: interpretationColRaw,
      interpretationMapped,
      isQc,
      target,
    })

    records.push({
      well,
      sampleId,
      patient: isQc ? '' : patient,
      testOrder: isQc ? '' : testOrder,
      panel: isQc ? 'Control' : panel,
      isQc,
      qcType: isQc ? (qcType || 'QC') : '',
      target,
      ct,
      viralLoad,
      ampStatus,
      interpretationValue,
      interpretation,
      type: isQc ? 'Control' : inferType(target, typeRaw),
      plateId,
      accessionNumber: isQc ? '' : accessionNumber,
      ampScore: readOptionalMetric(row, metricIdx.ampScore) || undefined,
      cqConfidence: cqConfidenceIdx >= 0 ? readOptionalMetric(row, cqConfidenceIdx) || undefined : undefined,
      reporterDye: reporterDyeIdx >= 0 ? readOptionalMetric(row, reporterDyeIdx) || undefined : undefined,
      thresholdValue: thresholdValueIdx >= 0 ? readOptionalMetric(row, thresholdValueIdx) || undefined : undefined,
    })
  }
  return propagateWellControlContext(records)
}

function propagateWellControlContext(records: RawMolecularRow[]): RawMolecularRow[] {
  const byWell = new Map<string, RawMolecularRow[]>()
  for (const row of records) {
    const list = byWell.get(row.well) ?? []
    list.push(row)
    byWell.set(row.well, list)
  }

  const merged: RawMolecularRow[] = []
  for (const [, rows] of byWell) {
    const anchor = rows.find((r) => r.isQc || r.qcType || isControlRecord(r)) ?? rows[0]
    const sharedSampleId = anchor.sampleId.trim()
    const sharedQcType = anchor.qcType
    const sharedIsQc = rows.some((r) => r.isQc) || !!sharedQcType || isControlRecord(anchor)
    const sharedPanel = anchor.panel

    for (const row of rows) {
      const sampleId = row.sampleId.trim() || sharedSampleId
      let qcType = row.qcType || sharedQcType
      const isQc = row.isQc || sharedIsQc
      if (isQc && sampleId) {
        const fromSample = parseQcType(sampleId)
        if (fromSample && fromSample !== 'QC' && (!qcType || qcType === 'QC')) qcType = fromSample
      }
      merged.push({
        ...row,
        sampleId,
        qcType: isQc ? qcType : '',
        isQc,
        panel: row.panel || sharedPanel,
      })
    }
  }
  return merged
}

export function evaluatePlateViewReadiness(
  userMappings: UserFieldMapping[],
  options?: { plateIdOverride?: string; metadataPlateId?: string },
): PlateViewReadiness {
  const mappings = syncUserMappingsWithFieldDefs(userMappings)
  const wellColumnMapped = mappings.some((m) => m.key === 'well' && m.sourceColumn)
  const plateIdColumnMapped = mappings.some((m) => m.key === 'plateId' && m.sourceColumn)
  const plateIdOverrideProvided = Boolean(options?.plateIdOverride?.trim())
  const metadataPlateId = Boolean(options?.metadataPlateId?.trim())
  const plateIdAvailable = plateIdColumnMapped || plateIdOverrideProvided || metadataPlateId
  const canFormPlate = wellColumnMapped && plateIdAvailable

  if (canFormPlate) {
    return { canFormPlate, wellColumnMapped, plateIdAvailable }
  }

  const missing: string[] = []
  if (!wellColumnMapped) missing.push('well positions')
  if (!plateIdAvailable) missing.push('Plate ID')

  const missingLabel = missing.length === 2
    ? 'Plate ID and well positions'
    : missing[0] === 'Plate ID'
      ? 'Plate ID'
      : 'well positions'

  return {
    canFormPlate,
    wellColumnMapped,
    plateIdAvailable,
    message: `Plate cannot be formed — ${missingLabel} ${missing.length === 1 ? 'was' : 'were'} not found. Map Well Position and Plate ID in Field Mapping, or enter a Plate ID manually before continuing.`,
  }
}

export function resolvePlateId(
  context: FileParseContext,
  records: RawMolecularRow[],
  userMappings: UserFieldMapping[],
  plateIdOverride?: string,
): string {
  const override = plateIdOverride?.trim()
  if (override) return override.toUpperCase()

  const plateColumnMapped = userMappings.some((m) => m.key === 'plateId' && m.sourceColumn)
  if (plateColumnMapped) {
    const fromFile = records.map((r) => r.plateId).find((id) => id?.trim())
    if (fromFile) return fromFile.toUpperCase()
  }

  return (context.metadata.plateId || 'PLATE1').toUpperCase()
}

export async function buildUploadDataFromContext(
  context: FileParseContext,
  userMappings: UserFieldMapping[],
  options?: { plateIdOverride?: string; plateSize?: PlateSize; instrumentControls?: InstrumentControlConfig[] },
): Promise<ParsedUploadData> {
  await loadLisRegistry()
  const mappings = syncUserMappingsWithFieldDefs(userMappings)
  let records = recordsFromMappings(context, mappings)
  if (records.length === 0) {
    throw new Error('No result rows found. Check field mappings and file data.')
  }

  const plateId = resolvePlateId(context, records, mappings, options?.plateIdOverride)
  const plateColumnMapped = mappings.some((m) => m.key === 'plateId' && m.sourceColumn)
  if (options?.plateIdOverride?.trim() || !plateColumnMapped) {
    records = records.map((r) => ({ ...r, plateId }))
  }

  const plateViewReadiness = evaluatePlateViewReadiness(mappings, {
    plateIdOverride: options?.plateIdOverride,
    metadataPlateId: context.metadata.plateId,
  })

  return buildValidationData({
    fileName: context.fileName,
    rawText: context.rawText,
    fieldMappings: mappingsToFieldMappings(mappings),
    records,
    device: context.metadata.device,
    plateId,
    runDate: context.metadata.runDate,
    defaultPanel: context.metadata.defaultPanel,
    plateSize: options?.plateSize ?? 96,
    instrumentControls: options?.instrumentControls,
    plateViewReadiness,
    mappedTargetMetrics: buildMappedTargetMetrics(mappings),
   })
}

export async function parseMolecularFile(file: File): Promise<ParsedUploadData> {
  const context = await readSpreadsheetFile(file)
  const headerRow = context.rawRows[context.headerRowIndex] ?? []
  const sourceColumns = headerRow.map((h) => String(h ?? '').trim())
  const headers = sourceColumns.map((h) => normalizeHeader(h))
  const mappings = createAutoMappings(headers, sourceColumns)
  return buildUploadDataFromContext(context, mappings)
}

export async function parseMolecularFileFromUrl(url: string, fileName: string): Promise<ParsedUploadData> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load file: ${fileName}`)
  const buffer = await res.arrayBuffer()
  const file = new File([buffer], fileName, { type: 'application/octet-stream' })
  return parseMolecularFile(file)
}
