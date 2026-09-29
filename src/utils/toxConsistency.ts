import type { CompoundResult } from '../types/tox'

/**
 * Medication-monitoring consistency: does what the lab found match what the
 * provider prescribed? Both directions are clinically meaningful — an
 * unexpected positive suggests a drug the patient was not prescribed, an
 * unexpected negative suggests they are not taking what they were.
 */
export type Consistency = 'Consistent' | 'Inconsistent'

export type ConsistencyReason =
  | 'expected-positive'
  | 'expected-negative'
  | 'unexpected-positive'
  | 'unexpected-negative'

export interface ConsistencyVerdict {
  consistency: Consistency
  reason: ConsistencyReason
  label: string
}

export function consistencyFor(result: CompoundResult, prescribed: string[]): ConsistencyVerdict {
  const isPrescribed = prescribed.includes(result.compound)
  const isPositive = interpretationFor(result) === 'Positive'

  if (isPositive && isPrescribed) {
    return { consistency: 'Consistent', reason: 'expected-positive', label: 'Prescribed and detected' }
  }
  if (isPositive && !isPrescribed) {
    return { consistency: 'Inconsistent', reason: 'unexpected-positive', label: 'Detected but not prescribed' }
  }
  if (!isPositive && isPrescribed) {
    return { consistency: 'Inconsistent', reason: 'unexpected-negative', label: 'Prescribed but not detected' }
  }
  return { consistency: 'Consistent', reason: 'expected-negative', label: 'Not prescribed, not detected' }
}

export type Interpretation = 'Positive' | 'Negative'

/**
 * The system's call on a drug: at or above the cut-off is Positive, anything
 * below it is Negative. Nothing else. Needing a dilution is a workflow state
 * carried on the sample, not a third interpretation.
 */
export function interpretationFor(result: CompoundResult): Interpretation {
  if (result.concentration == null || result.cutOff == null) return 'Negative'
  return result.concentration >= result.cutOff ? 'Positive' : 'Negative'
}

/**
 * How many drugs on this sample disagree with what was prescribed.
 *
 * Both directions count: a drug found that was not prescribed, and a drug
 * prescribed that was not found. The second is why this cannot be read off the
 * results alone — a prescribed drug that never registered has no positive row.
 */
export function inconsistentCount(results: CompoundResult[], prescribed: string[]): number {
  return results.filter((r) => consistencyFor(r, prescribed).consistency === 'Inconsistent').length
}
