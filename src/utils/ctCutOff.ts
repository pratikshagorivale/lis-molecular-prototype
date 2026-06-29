export type CtCutOffOperator = '>=' | '<='

export interface ParsedCtCutOff {
  operator: CtCutOffOperator
  value: string
}

const DEFAULT_OPERATOR: CtCutOffOperator = '<='

export function parseCtCutOff(raw: string): ParsedCtCutOff {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(>=|<=)\s*(\d+(?:\.\d+)?)$/)
  if (match) {
    return { operator: match[1] as CtCutOffOperator, value: match[2] }
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { operator: DEFAULT_OPERATOR, value: trimmed }
  }
  return { operator: DEFAULT_OPERATOR, value: '' }
}

export function formatCtCutOff(operator: CtCutOffOperator, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return `${operator}${trimmed}`
}

/** Prefill from target master (e.g. "35" → "<=35"). */
export function defaultCtCutOffFromMaster(masterValue: string): string {
  const trimmed = masterValue.trim()
  if (!trimmed || trimmed === '—') return ''
  return formatCtCutOff(DEFAULT_OPERATOR, trimmed)
}

export function buildTargetCtCutOff(operator: CtCutOffOperator, masterValue: string): string {
  const trimmed = masterValue.trim()
  if (!trimmed || trimmed === '—') return ''
  return formatCtCutOff(operator, trimmed)
}

export function mergeTargetCtCutOff(raw: string, masterValue: string): string {
  return buildTargetCtCutOff(parseCtCutOff(raw).operator, masterValue)
}

export function normalizeCtCutOff(raw: string, masterFallback?: string): string {
  return mergeTargetCtCutOff(raw, masterFallback ?? '')
}

export function matchesCtCutOff(actualCt: number | string, cutOff: string): boolean | null {
  const parsed = parseCtCutOff(cutOff)
  if (!parsed.value) return null

  const actual = typeof actualCt === 'number' ? actualCt : Number.parseFloat(String(actualCt))
  const threshold = Number.parseFloat(parsed.value)
  if (Number.isNaN(actual) || Number.isNaN(threshold)) return null

  return parsed.operator === '>=' ? actual >= threshold : actual <= threshold
}
