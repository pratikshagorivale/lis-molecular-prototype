import type { ToxBatch } from '../types/tox'

/**
 * Order-side context for a toxicology sample: who it belongs to, what was
 * prescribed, what the last result was.
 *
 * None of this is in the instrument file — in production it comes from the
 * order and from Drug Master / Panel Master, the same way molecular pulls
 * patient and panel from LIMS. Generated deterministically from the sample id
 * here so the prototype is stable across reloads.
 */

export interface ToxOrderContext {
  sampleId: string
  patientRef: string
  patientName: string
  patientMeta: string
  /** The specimen collected — Urine, Blood, Oral fluid. From the order, since
   *  no vendor export states it: their "sample type" column is the plate role. */
  sampleType: string
  service: string
  /** Drugs the provider prescribed — drives the consistency column. */
  prescribed: string[]
  clinicalNote: string
  /** When the patient's previous specimen was collected — the History column. */
  previousCollectedOn: string
  /** One row per drug reported on that previous specimen. */
  history: ToxHistoryEntry[]
}

/** A drug as it was reported on the patient's previous specimen. */
export interface ToxHistoryEntry {
  drug: string
  sampleType: string
  value: string
  unit: string
  cutOff: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']

/** "17th Dec, 2025" — the format the history table uses elsewhere. */
function formatCollectedOn(runDate: string, daysBefore: number): string {
  const base = Date.parse(runDate)
  const when = new Date(Number.isFinite(base) ? base : Date.now())
  when.setDate(when.getDate() - daysBefore)
  const day = when.getDate()
  const suffix = day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
      : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix} ${MONTHS[when.getMonth()]}, ${when.getFullYear()}`
}

/** Weighted toward urine, which is most of what a tox lab receives. */
const SAMPLE_TYPES = ['Urine', 'Urine', 'Urine', 'Oral fluid', 'Blood', 'Serum']

const FIRST = ['Michelle', 'Andre', 'Priya', 'Daniel', 'Rosa', 'Kwame', 'Lena', 'Tobias', 'Ingrid', 'Marcus', 'Yara', 'Felix']
const LAST = ['Daily', 'Okafor', 'Menon', 'Brandt', 'Alvarez', 'Boateng', 'Kowalski', 'Reyes', 'Lindqvist', 'Whitfield', 'Haddad', 'Nakamura']

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const CLINICAL_NOTES = [
  '',
  '',
  '',
  'Chronic pain management — monthly monitoring',
  'Patient reports missed doses this week',
  'New to practice, baseline sample',
]

export function buildOrderContext(batch: ToxBatch): Map<string, ToxOrderContext> {
  const context = new Map<string, ToxOrderContext>()
  const samples = batch.positions.filter((p) => p.type === 'Sample')

  for (const position of samples) {
    const seed = hash(position.sampleId)
    const first = FIRST[seed % FIRST.length]
    const last = LAST[(seed >> 4) % LAST.length]
    const age = 24 + (seed % 48)
    const sex = seed % 2 === 0 ? 'F' : 'M'

    // Prescribe a couple of the panel's own compounds, plus usually one the
    // patient turns out to be positive for — so the table shows both kinds of
    // inconsistency rather than only unexpected positives.
    const positives = position.results
      .filter((r) => r.verdict === 'Positive' || r.verdict === 'Over Curve')
      .map((r) => r.compound)

    const prescribed: string[] = []
    if (positives.length > 0 && seed % 3 !== 0) prescribed.push(positives[seed % positives.length])
    const pool = batch.compounds.filter((c) => !prescribed.includes(c))
    if (pool.length > 0) prescribed.push(pool[seed % pool.length])
    if (pool.length > 1 && seed % 4 === 0) prescribed.push(pool[(seed >> 8) % pool.length])

    // The previous specimen: a few weeks back, reporting the drugs this one
    // found. The cut-off shown is the one in force now, so the two are read on
    // the same scale.
    const previousCollectedOn = formatCollectedOn(batch.runDate, 30 + (seed % 60))
    const sampleType = SAMPLE_TYPES[seed % SAMPLE_TYPES.length]
    const history: ToxHistoryEntry[] = positives.slice(0, 4).map((compound) => {
      const current = position.results.find((r) => r.compound === compound)
      // Seeded per drug as well as per sample, so a patient's drugs do not all
      // come back at the same number.
      const drugSeed = hash(`${position.sampleId}:${compound}`)
      const cutOff = current?.cutOff ?? 0
      return {
        drug: compound,
        // The previous specimen was the same kind, which is what makes the two
        // comparable at all.
        sampleType,
        value: drugSeed % 7 === 0
          ? 'Not detected'
          : String(Math.round(cutOff > 0 ? cutOff * (1 + (drugSeed % 40) / 4) : (drugSeed % 900) + 50)),
        unit: current?.unit || batch.unit,
        cutOff: current?.cutOff != null ? String(current.cutOff) : '—',
      }
    })

    context.set(position.sampleId, {
      sampleId: position.sampleId,
      patientRef: `#${50000 + (seed % 9999)}`,
      patientName: `${first} ${last}`,
      patientMeta: `${age} years - ${sex}`,
      sampleType: SAMPLE_TYPES[seed % SAMPLE_TYPES.length],
      service: batch.assayRole === 'screening'
        ? 'Screening w/ Reflex to Confirmation'
        : 'Confirmation — LC-MS/MS',
      prescribed: [...new Set(prescribed)],
      clinicalNote: CLINICAL_NOTES[seed % CLINICAL_NOTES.length],
      previousCollectedOn,
      history,
    })
  }

  return context
}
