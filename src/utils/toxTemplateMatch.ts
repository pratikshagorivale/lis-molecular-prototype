import { SEEDED_TOX_TEMPLATES } from '../data/toxTemplates'
import type { TemplateMatch, ToxFileTemplate } from '../types/toxTemplate'

/**
 * Rank the catalogue's parsers against a file.
 *
 * The technologist picks the parser, so this is not the decision — it is what
 * tells them which one they should have picked when the chosen one does not
 * fit. Header text alone is not enough. Shimadzu headers follow the instrument PC's
 * UI language, so an English required-column list will not match a Chinese
 * export of the same format. Shape markers and the first-cell pattern are
 * language independent and carry the match when the text does not, so a
 * template can score without any of its column names being recognised.
 */

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

/** Header row as the template's `locate` config says to find it. */
export function headerRowFor(rows: string[][], template: ToxFileTemplate): string[] {
  const { locate } = template
  if (locate.kind === 'row') return rows[locate.headerRow] ?? []
  const index = rows.findIndex((row) => new RegExp(locate.firstCellMatches).test((row[0] ?? '').trim()))
  return index < 0 ? [] : rows[index + locate.offsetToHeader] ?? []
}

export function scoreTemplate(
  rows: string[][],
  fileName: string,
  template: ToxFileTemplate,
): TemplateMatch {
  const reasons: string[] = []
  const header = headerRowFor(rows, template).map((c) => normalise(c))
  const present = new Set(header.filter(Boolean))
  const firstRow = (rows[0] ?? []).map((c) => c.trim())

  const { match } = template

  // A forbidden column is disqualifying: it is what separates two otherwise
  // near-identical formats.
  for (const column of match.forbiddenColumns ?? []) {
    if (present.has(normalise(column))) {
      return { template, score: 0, reasons: [`'${column}' is present and this format excludes it`] }
    }
  }

  let score = 0

  const required = match.requiredColumns ?? []
  const found = required.filter((column) => present.has(normalise(column)))
  if (required.length > 0) {
    if (found.length === required.length) {
      // Specificity wins: a template naming more columns is a tighter fit.
      score += required.length * 2
      reasons.push(`all ${required.length} required columns present`)
    } else if (found.length > 0) {
      reasons.push(`${found.length} of ${required.length} required columns present`)
    }
  }

  if (match.firstCellPattern && new RegExp(match.firstCellPattern).test(firstRow[0] ?? '')) {
    score += 3
    reasons.push('first cell matches')
  }
  if (match.anyFirstRowPattern) {
    const pattern = new RegExp(match.anyFirstRowPattern)
    if (firstRow.some((cell) => pattern.test(cell))) {
      score += 3
      reasons.push('header row carries the expected group-label marker')
    }
  }
  if (match.filenamePattern && new RegExp(match.filenamePattern, 'i').test(fileName)) {
    score += 1
    reasons.push('filename matches')
  }

  return { template, score, reasons }
}

export function rankTemplates(
  rows: string[][],
  fileName: string,
  templates: ToxFileTemplate[] = SEEDED_TOX_TEMPLATES,
): TemplateMatch[] {
  return templates
    .map((template) => scoreTemplate(rows, fileName, template))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
}

export function matchTemplate(
  rows: string[][],
  fileName: string,
  templates: ToxFileTemplate[] = SEEDED_TOX_TEMPLATES,
): ToxFileTemplate | null {
  return rankTemplates(rows, fileName, templates)[0]?.template ?? null
}
