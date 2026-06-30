import { getTargetCtCutOff } from '../data/targetMaster'
import type { Interpretation } from '../types'

export const DEFAULT_TARGET_CT_CUTOFF = 35

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

export function isVagueCtValue(ct: string | number | undefined): boolean {
  const s = String(ct ?? '').trim().toLowerCase()
  if (!s || s === '-' || s === 'undetermined' || s === 'u' || s === 'na' || s === 'n/a') return true
  const n = parseFloat(s)
  return Number.isNaN(n) || n <= 0
}

export function resolveTargetCtCutOffNumeric(target: string): number {
  const fromMaster = getTargetCtCutOff(target)
  if (!fromMaster.trim() || fromMaster === '—') return DEFAULT_TARGET_CT_CUTOFF
  const n = parseFloat(fromMaster)
  return Number.isNaN(n) ? DEFAULT_TARGET_CT_CUTOFF : n
}

export function inferInterpretationFromCtCutoff(
  ct: string | number,
  cutOff = DEFAULT_TARGET_CT_CUTOFF,
): Interpretation {
  if (isVagueCtValue(ct)) return 'Inconclusive'
  const n = parseFloat(String(ct))
  return n <= cutOff ? 'Detected' : 'Not Detected'
}

function inferFromCt(ct: string | number): Interpretation {
  return inferInterpretationFromCtCutoff(ct, 45)
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

export function parseMappedInterpretation(rawValue: unknown, options?: { isQc?: boolean }): Interpretation {
  const normalized = normalizeAmpStatusCell(rawValue)
  const v = normalized.toLowerCase()
  if (!v) return 'Inconclusive'
  if (options?.isQc && matchesPassed(v)) return 'Passed'
  if (matchesDetected(v)) return 'Detected'
  if (/^inconclusive/.test(v) || /^undetermined/.test(v)) return 'Inconclusive'
  if (matchesNotDetected(v)) return 'Not Detected'
  return 'Inconclusive'
}

export function resolveRowInterpretation(
  ct: string | number,
  options: {
    mappedRaw?: string
    interpretationMapped: boolean
    isQc?: boolean
    target?: string
  },
): { interpretation: Interpretation; interpretationValue?: string } {
  if (options.interpretationMapped) {
    const raw = (options.mappedRaw ?? '').trim()
    return {
      interpretation: parseMappedInterpretation(raw, { isQc: options.isQc }),
      interpretationValue: raw || undefined,
    }
  }
  if (options.isQc) {
    return { interpretation: parseInterpretation('', ct, { isQc: true }) }
  }
  const cutOff = options.target ? resolveTargetCtCutOffNumeric(options.target) : DEFAULT_TARGET_CT_CUTOFF
  return { interpretation: inferInterpretationFromCtCutoff(ct, cutOff) }
}

export function isPositiveResult(
  interpretation: Interpretation,
  _ampStatus?: string,
  _ct?: string | number,
): boolean {
  return interpretation === 'Detected' || interpretation === 'Passed'
}

export function isInconclusiveAmpStatus(ampStatus?: string): boolean {
  const v = normalizeAmpStatusCell(ampStatus).toLowerCase()
  return /^inconclusive/.test(v) || /^undetermined/.test(v) || v === 'u'
}

/** User-facing interpretation; inconclusive amp status takes precedence over Ct-inferred Detected. */
export function displayTargetInterpretation(
  interpretation: Interpretation,
  ampStatus?: string,
): Interpretation {
  if (interpretation === 'Inconclusive') return 'Inconclusive'
  if (ampStatus?.trim() && isInconclusiveAmpStatus(ampStatus)) return 'Inconclusive'
  return interpretation
}

export function formatInterpretationDisplay(
  interpretation: Interpretation,
  options?: { interpretationValue?: string },
): string {
  if (options?.interpretationValue?.trim()) return options.interpretationValue.trim()
  return interpretation
}

export function interpretationDisplayClassName(interpretation: Interpretation): string {
  if (interpretation === 'Detected') return 'text-red-600 font-medium'
  if (interpretation === 'Not Detected') return 'text-emerald-600 font-medium'
  if (interpretation === 'Inconclusive') return 'text-amber-600 font-medium'
  return 'text-slate-500'
}
