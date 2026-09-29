import { matchTemplate } from './toxTemplateMatch'
import type { BatchLayout } from '../types/tox'
import type { ToxFileTemplate } from '../types/toxTemplate'

/**
 * Every export is normalised to one long table — a flat list of records, one
 * per injection x compound — before anything is mapped. How to do that is read
 * from a template rather than branched on a sniffed vendor.
 *
 * This is what makes column mapping possible at all. A pivoted export keeps the
 * compound name in a group-header row, with each compound owning a block of
 * columns, so there is no "Drug Name" column to bind to until the file is
 * un-pivoted. Once every shape is long, the same mapping UI works on all of them.
 */

export interface ToxLongTable {
  templateId: string
  templateLabel: string
  /** Source column names, in file order, as the mapping dropdowns show them. */
  columns: string[]
  records: Record<string, string>[]
  rawText: string
}

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

function rawPreview(rows: string[][], limit = 25): string {
  return rows
    .slice(0, limit)
    .map((row) => row.map((cell) => (cell.length > 24 ? `${cell.slice(0, 22)}…` : cell)).join(','))
    .join('\n')
}

// ---------------------------------------------------------------------------
// Agilent — un-pivot the compound groups into one record per compound
// ---------------------------------------------------------------------------

/**
 * Find the repeating block in a sub-header row: walk it and stop at the first
 * label that occurs twice. Those two positions give the block start and the
 * block width. This resolves a 2-compound panel and a 75-compound panel from
 * the same template, which is why `blockStartColumn` and `blockWidth` default
 * to 'auto'.
 */
export function detectBlocks(subRow: string[]): { start: number; width: number } | null {
  const seen = new Map<string, number>()
  for (let i = 0; i < subRow.length; i += 1) {
    const label = normalise(subRow[i])
    if (!label) continue
    const first = seen.get(label)
    if (first != null) return { start: first, width: i - first }
    seen.set(label, i)
  }
  return null
}

function wideLongTable(rows: string[][], template: ToxFileTemplate): ToxLongTable {
  if (template.shape.kind !== 'wide') throw new Error('wideLongTable called with a non-wide shape')
  const { shape } = template
  const headerRow = template.locate.kind === 'row' ? template.locate.headerRow : 1
  const dataStart = template.locate.kind === 'row' ? template.locate.dataStartRow : headerRow + 1

  const groupRow = rows[shape.nameRow] ?? []
  const subRow = rows[headerRow] ?? []

  const detected = detectBlocks(subRow)
  const start = shape.blockStartColumn === 'auto' ? detected?.start : shape.blockStartColumn
  const width = shape.blockWidth === 'auto' ? detected?.width : shape.blockWidth
  if (start == null || width == null || width < 1) {
    throw new Error('Could not find the repeating compound columns. Set the block start and width in File Shape.')
  }

  const cleanup = shape.nameCleanup ? new RegExp(shape.nameCleanup, 'i') : null
  const subColumns = shape.subColumns
    ?? Array.from({ length: width }, (_, i) => (subRow[start + i] ?? `Column ${i + 1}`).trim())

  const blocks: { compound: string; offset: number }[] = []
  for (let col = start; col + width <= subRow.length; col += width) {
    // The group label is merged across the block, so the CSV carries it on one
    // column and leaves the rest empty — take whichever cell is non-empty.
    const raw = groupRow.slice(col, col + width).find((c) => c && c.trim()) ?? ''
    const label = (cleanup ? raw.replace(cleanup, '') : raw).trim()
    if (!label) continue
    blocks.push({ compound: label, offset: col })
  }
  if (blocks.length === 0) {
    throw new Error('No compound groups found. Check the name row in File Shape.')
  }


  // Per-injection columns are every labelled column left of the blocks.
  const rowColumns: { label: string; index: number }[] = []
  for (let col = 0; col < start; col += 1) {
    const label = subRow[col]?.trim()
    if (label) rowColumns.push({ label, index: col })
  }

  // Columns before the first labelled one carry unlabelled vendor markers —
  // MassHunter puts its '!' outlier flags there.
  const firstLabelled = rowColumns[0]?.index ?? start
  const flagCols = Array.from({ length: firstLabelled }, (_, i) => i)

  // A position column that carries plate and well together is split so the
  // plate becomes a column in its own right and can be mapped like any other.
  const columns = [...rowColumns.map((c) => c.label), 'Plate', 'Compound', ...subColumns, 'Flags']

  const typeCell = rowColumns.find((c) => normalise(c.label) === 'type')
  const posLabel = rowColumns.find((c) => normalise(c.label) === 'pos.')?.label
  const idLabel = rowColumns.find((c) => normalise(c.label) === 'data file')?.label

  const records: Record<string, string>[] = []
  rows.slice(dataStart).forEach((row, index) => {
    if (typeCell && !(row[typeCell.index] ?? '').trim()) return

    const base: Record<string, string> = {}
    for (const column of rowColumns) base[column.label] = (row[column.index] ?? '').trim()
    base.Flags = flagCols.map((c) => (row[c] ?? '').trim()).filter(Boolean).length ? 'Outlier' : ''
    // The injection id must be unique; synthesise one when the column is absent.
    if (idLabel && !base[idLabel]) base[idLabel] = `${base.Name ?? 'row'}-${index}`

    const rawPos = posLabel ? base[posLabel] ?? '' : ''
    const platePrefix = rawPos.match(/^(.+)[-_][A-Za-z]?\d{1,3}$/)
    base.Plate = platePrefix ? platePrefix[1].trim() : ''

    for (const block of blocks) {
      const record: Record<string, string> = { ...base, Compound: block.compound }
      subColumns.forEach((label, i) => {
        record[label] = (row[block.offset + i] ?? '').trim()
      })
      records.push(record)
    }
  })

  return {
    templateId: template.id,
    templateLabel: template.label,
    columns,
    records,
    rawText: rawPreview(rows),
  }
}

// ---------------------------------------------------------------------------
// Long — already one row per compound per injection
// ---------------------------------------------------------------------------

function flatLongTable(rows: string[][], template: ToxFileTemplate): ToxLongTable {
  const headerRow = template.locate.kind === 'row' ? template.locate.headerRow : 0
  const dataStart = template.locate.kind === 'row' ? template.locate.dataStartRow : headerRow + 1
  const header = (rows[headerRow] ?? []).map((c) => c.trim())

  const records = rows.slice(dataStart).map((row) => {
    const record: Record<string, string> = {}
    header.forEach((label, i) => {
      if (label) record[label] = (row[i] ?? '').trim()
    })
    return record
  })

  return {
    templateId: template.id,
    templateLabel: template.label,
    columns: header.filter(Boolean),
    records,
    rawText: rawPreview(rows),
  }
}

export function toLongTable(rows: string[][], template?: ToxFileTemplate): ToxLongTable {
  const resolved = template ?? matchTemplate(rows, '')
  if (!resolved) {
    throw new Error('No parser in the catalogue recognises this file.')
  }
  if (resolved.shape.kind === 'wide') return wideLongTable(rows, resolved)
  return flatLongTable(rows, resolved)
}

// ---------------------------------------------------------------------------
// System fields
// ---------------------------------------------------------------------------

export type ToxMappingKey =
  | 'sampleId'
  | 'drugName'
  | 'result'
  | 'wellPosition'
  | 'plateId'
  | 'injectionType'
  | 'level'
  | 'accuracy'
  | 'acquired'

export interface ToxMappingFieldDef {
  key: ToxMappingKey
  label: string
  required: boolean
  /** Header names to auto-detect, most specific first. */
  aliases: string[]
}

/**
 * The four required fields are the minimum to form a result on a plate. The
 * optional four are what the QC engine reads: without an injection type there
 * are no calibrators to find, and without recovery there is no curve to judge.
 * Everything not bound here is carried through as an additional field and shown
 * in the position drawer.
 */
export const TOX_MAPPING_FIELD_DEFS: ToxMappingFieldDef[] = [
  {
    key: 'sampleId', label: 'Sample ID', required: true,
    aliases: ['sample name', 'sample id', 'sample text', 'name', 'sample', 'accession'],
  },
  {
    key: 'drugName', label: 'Drug Name', required: true,
    // 'component name' is SCIEX; 'peak name' is SCIEX report mode.
    aliases: ['compound', 'component name', 'component', 'peak name', 'drug name', 'drug', 'analyte', 'target'],
  },
  {
    key: 'result', label: 'Result Value', required: true,
    // Most specific first. Vendors disagree even with themselves: MassHunter
    // has both Final Conc. and Calc. Conc.; SCIEX writes 'Calculated
    // Concentration' in the table and 'Calculated Conc.' in the report.
    aliases: [
      'final conc.', 'calculated concentration', 'calculated conc.', 'calc. conc.',
      'calculated amount', 'analconc', 'conc.', 'concentration', 'amount', 'result',
    ],
  },
  {
    key: 'wellPosition', label: 'Well Position', required: true,
    aliases: ['position', 'pos.', 'vial position', 'vial number', 'vial', 'well', 'well position'],
  },
  // A run can span several plates or trays, and only one can be drawn at a
  // time. Left unmapped, the plate is recovered from a prefix on the position.
  {
    key: 'plateId', label: 'Plate / Tray', required: false,
    aliases: ['plate', 'plate number', 'plate id', 'tray', 'tray name', 'rack number', 'rack'],
  },
  // 'Sample Type' first: LabSolutions also exports a peak-type column called
  // 'Type' holding 'Target', which would hide every calibrator.
  {
    key: 'injectionType', label: 'Injection Type', required: false,
    aliases: ['sample type', 'type'],
  },
  {
    key: 'level', label: 'Calibrator Level', required: false,
    aliases: ['level', 'cal point', 'cal level'],
  },
  {
    key: 'accuracy', label: 'Recovery %', required: false,
    aliases: ['accuracy', 'accuracy(%)', 'accuracy (%)', '%dev', '%diff'],
  },
  {
    key: 'acquired', label: 'Acquired Date-Time', required: false,
    aliases: ['acq. date-time', 'acquired date', 'acquisition date', 'acq.date', 'acq date'],
  },
]

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export interface ParsedPosition {
  plateId: string
  positionId: string
  row: string
  column: number
}

/**
 * 'P4-A1' -> plate P4 / well A1; 'A1' -> bare well. When the plate came from
 * its own mapped column, any matching prefix is stripped off the position so
 * 'P4-A1' does not become plate 'P4' well 'P4-A1'.
 */
export function parsePosition(raw: string, mappedPlate?: string): ParsedPosition {
  let text = raw.trim()
  if (mappedPlate) {
    const prefix = new RegExp(`^${mappedPlate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[-_]`, 'i')
    text = text.replace(prefix, '').trim()
    const well = text.toUpperCase().match(/^([A-Z])(\d{1,2})$/)
    return {
      plateId: mappedPlate,
      positionId: text.toUpperCase(),
      row: well?.[1] ?? '',
      column: well ? Number(well[2]) : 0,
    }
  }
  const split = text.match(/^(.+)-([A-Za-z]?\d{1,3})$/)
  if (split) {
    const positionId = split[2].toUpperCase()
    const well = positionId.match(/^([A-Z])(\d{1,2})$/)
    return {
      plateId: split[1].trim(),
      positionId,
      row: well?.[1] ?? '',
      column: well ? Number(well[2]) : 0,
    }
  }
  const bare = text.toUpperCase().match(/^([A-Z])(\d{1,2})$/)
  if (bare) return { plateId: '', positionId: text.toUpperCase(), row: bare[1], column: Number(bare[2]) }
  return { plateId: '', positionId: text, row: '', column: 0 }
}

/** Two plate sizes are supported. 1536 is deliberately out of scope. */
export const PLATE_GEOMETRY = {
  96: { rows: 8, cols: 12 },
  384: { rows: 16, cols: 24 },
} as const

export type SupportedPlateSize = keyof typeof PLATE_GEOMETRY
const SUPPORTED_PLATE_SIZES: SupportedPlateSize[] = [96, 384]

const ROW_LETTERS = 'ABCDEFGHIJKLMNOP'

/**
 * Lay a sequential vial number onto a plate, row-major.
 *
 * SCIEX and other autosamplers report position as a plain integer. A lab that
 * pipetted a 96-well plate and loaded it whole thinks in wells, so the integer
 * has to become one — but only when the template says the run was plated.
 */
export function indexToWell(
  index: number,
  plateSize: SupportedPlateSize,
): { well: string; row: string; column: number } | null {
  const { rows, cols } = PLATE_GEOMETRY[plateSize]
  if (!Number.isFinite(index) || index < 1 || index > rows * cols) return null
  const zero = Math.floor(index) - 1
  const row = ROW_LETTERS[Math.floor(zero / cols)]
  const column = (zero % cols) + 1
  return { well: `${row}${column}`, row, column }
}

const WELL_PATTERN = /^([A-P])(\d{1,2})$/

/**
 * Layout is decided by the data, not the vendor: positions that all look like
 * plate wells make a grid; anything else is an autosampler rack.
 */
export function detectLayout(positionIds: string[]): BatchLayout {
  if (positionIds.length === 0) return 'rack'
  return positionIds.every((id) => {
    const match = id.match(WELL_PATTERN)
    if (!match) return false
    const column = Number(match[2])
    return column >= 1 && column <= 24
  }) ? 'grid' : 'rack'
}

/** The smallest plate that contains every resolved address. */
export function fitPlateSizeForWells(positionIds: string[]): SupportedPlateSize | null {
  let maxRow = 0
  let maxCol = 0
  for (const id of positionIds) {
    const match = id.match(WELL_PATTERN)
    if (!match) return null
    maxRow = Math.max(maxRow, ROW_LETTERS.indexOf(match[1]) + 1)
    maxCol = Math.max(maxCol, Number(match[2]))
  }
  for (const size of SUPPORTED_PLATE_SIZES) {
    const { rows, cols } = PLATE_GEOMETRY[size]
    if (maxRow <= rows && maxCol <= cols) return size
  }
  return null
}
