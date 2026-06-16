const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const PLATE_WELL_RE = /^[A-H](?:[1-9]|1[0-2])$/

export function isValidPlateWell(wellId: string): boolean {
  return PLATE_WELL_RE.test(wellId)
}

export function indexToWell(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 96) return null
  const idx = Math.floor(n) - 1
  const row = ROWS[Math.floor(idx / 12)]
  const col = (idx % 12) + 1
  return `${row}${col}`
}

/** Convert instrument/export well values to A1–H12 grid coordinates. */
export function normalizeWell(value: unknown): string {
  if (value == null || value === '') return ''

  // Excel may provide numbers (1–96 well index, or column number)
  if (typeof value === 'number') {
    const asIndex = indexToWell(value)
    if (asIndex) return asIndex
    return String(value)
  }

  const raw = String(value).trim()
  if (!raw) return ''

  // Numeric string: "1"–"96" well index, or "1.0" from Excel
  const num = parseFloat(raw)
  if (!isNaN(num) && /^\d+(\.0+)?$/.test(raw)) {
    const asIndex = indexToWell(Math.round(num))
    if (asIndex) return asIndex
  }

  const cleaned = raw.toUpperCase().replace(/\s+/g, '')

  // A1, A01, A12
  let match = cleaned.match(/^([A-H])0*(\d{1,2})$/)
  if (match) return `${match[1]}${Number(match[2])}`

  // A-1, A:1
  match = cleaned.replace(/[:\-_]/g, '').match(/^([A-H])0*(\d{1,2})$/)
  if (match) return `${match[1]}${Number(match[2])}`

  // 1A (column then row — rare)
  match = cleaned.match(/^0*(\d{1,2})([A-H])$/)
  if (match) return `${match[2]}${Number(match[1])}`

  // WELLA1, POSA1
  match = cleaned.match(/(?:WELL|POS|POSITION)?([A-H])0*(\d{1,2})$/)
  if (match) return `${match[1]}${Number(match[2])}`

  return cleaned
}

export function combineRowCol(rowVal: unknown, colVal: unknown): string {
  const row = String(rowVal ?? '').trim().toUpperCase()
  const col = String(colVal ?? '').trim()
  if (row && col) return normalizeWell(`${row}${col}`)
  if (row) return normalizeWell(row)
  if (col) return normalizeWell(col)
  return ''
}
