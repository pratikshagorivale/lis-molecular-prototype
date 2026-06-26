import type { Interpretation } from '../types'

export function normalizeAmpStatusCell(raw: unknown): string {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'boolean') return raw ? 'Amp' : 'No Amp'
  if (typeof raw === 'number') {
    if (raw === 1) return 'Amp'
    if (raw === 0) return 'No Amp'
    return String(raw)
  }
  let s = String(raw).trim().replace(/\.+$/g, '').replace(/\s+/g, ' ')
  if (/^dete?cted$/i.test(s.replace(/[^a-z]/gi, ''))) return 'Detected'
  return s
}

export function hasAmplifiedCt(ct: string | number | undefined): boolean {
  const s = String(ct ?? '').trim().toLowerCase()
  if (!s || s === '-' || s === 'undetermined' || s === 'u' || s === 'na' || s === 'n/a') return false
  const n = parseFloat(s)
  return !Number.isNaN(n) && n > 0 && n < 45
}

function inferFromCt(ct: string | number): Interpretation {
  const s = String(ct).trim()
  const lower = s.toLowerCase()
  if (!s || s === '-' || lower === 'undetermined' || lower === 'u' || lower === 'na' || lower === 'n/a') {
    return 'Not Detected'
  }
  const n = parseFloat(s)
  if (!Number.isNaN(n) && n > 0 && n < 45) return 'Detected'
  return 'Not Detected'
}

function matchesNotDetected(v: string): boolean {
  return (
    /^no\s*amp/.test(v)
    || /^not\s*amp/.test(v)
    || /unamplified/.test(v)
    || /not\s+amplified/.test(v)
    || /^neg/.test(v)
    || /^negative/.test(v)
    || /^no$/.test(v)
    || /^n$/.test(v)
    || /^not\s+detect/.test(v)
    || /^non[\s-]?detect/.test(v)
    || /^undetected/.test(v)
    || /^inconclusive/.test(v)
    || /^undetermined/.test(v)
    || /^invalid/.test(v)
    || /^noninformative/.test(v)
    || /^non[\s-]?informative/.test(v)
    || /^0$/.test(v)
    || /^false$/.test(v)
    || /^absent$/.test(v)
    || v === '-'
  )
}

function matchesPassed(v: string): boolean {
  return (
    /pass/.test(v)
    || v === 'pc'
    || v === 'nc'
    || v === 'valid'
    || v === 'ok'
    || v === 'success'
  )
}

function matchesDetected(v: string): boolean {
  if (matchesNotDetected(v) || matchesPassed(v)) return false
  if (
    v === 'amp'
    || v === '+'
    || v === '++'
    || /^amplified/.test(v)
    || /^pos/.test(v)
    || /^positive/.test(v)
    || v === 'detected'
    || v === 'detetected'
    || v === 'detectd'
    || v === 'det'
    || v === 'yes'
    || v === 'y'
    || v === '1'
    || v === 'true'
    || v === 't'
    || /^present/.test(v)
    || /^reactive/.test(v)
    || /^informative/.test(v)
    || (v.includes('detect') && !v.includes('not') && !v.includes('non'))
    || (v.includes('amp') && !/^no/.test(v) && !v.includes('not'))
  ) {
    return true
  }
  return false
}

/** True when raw amp status text indicates no amplification. */
export function isAmpStatusNotDetected(rawValue: unknown): boolean {
  const v = normalizeAmpStatusCell(rawValue).toLowerCase()
  if (!v) return false
  return matchesNotDetected(v)
}

/** True when raw amp status text indicates amplification, even if Ct is undetermined. */
export function isAmpStatusDetected(rawValue: unknown): boolean {
  const v = normalizeAmpStatusCell(rawValue).toLowerCase()
  if (!v) return false
  return matchesDetected(v)
}

export function parseInterpretation(
  rawValue: unknown,
  ct: string | number,
  options?: { isQc?: boolean },
): Interpretation {
  const normalized = normalizeAmpStatusCell(rawValue)
  const v = normalized.toLowerCase()

  if (!v) {
    if (options?.isQc) return 'Passed'
    return inferFromCt(ct)
  }

  if (matchesPassed(v)) return 'Passed'
  if (matchesDetected(v)) return 'Detected'

  if (matchesNotDetected(v)) {
    if (/^inconclusive/.test(v) || /^undetermined/.test(v)) {
      const fromCt = inferFromCt(ct)
      if (fromCt === 'Detected') return 'Detected'
    }
    return 'Not Detected'
  }

  return inferFromCt(ct)
}

export function isPositiveResult(
  interpretation: Interpretation,
  ampStatus?: string,
  ct?: string | number,
): boolean {
  if (interpretation === 'Detected' || interpretation === 'Passed') return true
  if (ampStatus?.trim() && isAmpStatusDetected(ampStatus)) return true
  if (hasAmplifiedCt(ct)) return true
  if (ampStatus?.trim()) {
    const reparsed = parseInterpretation(ampStatus, ct ?? '-')
    return reparsed === 'Detected' || reparsed === 'Passed'
  }
  return inferFromCt(ct ?? '-') === 'Detected'
}

export function isInconclusiveAmpStatus(ampStatus?: string): boolean {
  const v = normalizeAmpStatusCell(ampStatus).toLowerCase()
  return /^inconclusive/.test(v) || /^undetermined/.test(v) || v === 'u'
}

/** User-facing interpretation; inconclusive amp status takes precedence over Ct-inferred Detected. */
export function displayTargetInterpretation(
  interpretation: Interpretation,
  ampStatus?: string,
): Interpretation | 'Inconclusive' {
  if (ampStatus?.trim() && isInconclusiveAmpStatus(ampStatus)) return 'Inconclusive'
  return interpretation
}

export function formatInterpretationDisplay(interpretation: Interpretation, ampStatus?: string): string {
  const raw = ampStatus?.trim()
  if (raw) return raw
  return interpretation
}
