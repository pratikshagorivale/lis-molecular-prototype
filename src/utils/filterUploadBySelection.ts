import { buildValidationData } from '../data/buildValidationData'
import type { InstrumentControlConfig, ParsedUploadData, PreviewRow } from '../types'
import { isControlRecord } from './qcDetection'
import type { RawMolecularRow } from './parseMolecularFile'
import { normalizeWell } from './wellPosition'

export interface FilterUploadOptions {
  instrumentControls?: InstrumentControlConfig[]
}


function filterRecordsBySelection(
  sourceRecords: RawMolecularRow[],
  previewRows: PreviewRow[],
  selectionRows: PreviewRow[],
): RawMolecularRow[] {
  const selectionById = new Map(selectionRows.map((row) => [row.id, row.selected]))
  const selectedIds = new Set(
    previewRows
      .filter((row) => selectionById.get(row.id) ?? row.selected)
      .map((row) => row.id),
  )

  const filtered = sourceRecords.filter((_, index) => selectedIds.has(String(index + 1)))
  if (filtered.length > 0) return filtered

  const selectedWells = new Set<string>()
  for (const row of previewRows) {
    if (!(selectionById.get(row.id) ?? row.selected)) continue
    const wellId = normalizeWell(row.wellPosition)
    if (wellId) selectedWells.add(wellId)
  }
  return sourceRecords.filter((record) => selectedWells.has(normalizeWell(record.well)))
}

function includeControlRecords(records: RawMolecularRow[], sourceRecords: RawMolecularRow[]): RawMolecularRow[] {
  const included = new Set(records.map((record) => normalizeWell(record.well)))
  const merged = [...records]
  for (const record of sourceRecords) {
    if (!isControlRecord(record)) continue
    const wellId = normalizeWell(record.well)
    if (!wellId || included.has(wellId)) continue
    merged.push(record)
    included.add(wellId)
  }
  return merged
}

export function filterUploadDataBySelection(
  data: ParsedUploadData,
  selectionRows: PreviewRow[],
  options: FilterUploadOptions = {},
): ParsedUploadData {
  const instrumentControls = options.instrumentControls ?? []
  const filteredRecords = includeControlRecords(
    filterRecordsBySelection(
      data.sourceRecords,
      data.previewRows,
      selectionRows,
    ),
    data.sourceRecords,
  )

  const rebuilt = buildValidationData({
    fileName: data.fileName,
    rawText: data.rawText,
    fieldMappings: data.fieldMappings,
    records: filteredRecords,
    device: data.plateSummary.device,
    plateId: data.plateSummary.plateId,
    runDate: data.plateSummary.runDate,
    defaultPanel: data.defaultPanel,
    plateSize: data.plateSize,
    instrumentControls,
    plateViewReadiness: data.plateViewReadiness,
    mappedTargetMetrics: data.mappedTargetMetrics,
  })

  return {
    ...rebuilt,
    previewRows: rebuilt.previewRows.map((row) => ({ ...row, selected: true })),
    sourceRecords: data.sourceRecords,
  }
}
