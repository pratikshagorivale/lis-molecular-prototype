import type { PositionType } from './tox'

/**
 * Control configuration for a toxicology instrument.
 *
 * The parser knows how to *read* a file; it does not know what this lab calls
 * its controls or what each drug has to reach for the control to pass. That is
 * lab knowledge and it is configured here, the same way molecular configures
 * PC/NC/NTC — with drugs and concentration cut-offs in place of targets and Ct.
 */

export type ToxControlType = 'Calibrator' | 'QC' | 'Blank'

/** All drugs on the panel, or a named few. */
export type ToxControlScope = 'panel' | 'targeted'

/** How far a failed control reaches. */
export type ToxControlFailureBehavior = 'fail-plate' | 'fail-drug'

/**
 * How a control's reading is compared with its cut-off.
 *
 * This is the whole of a control's expectation: at or above the cut-off the
 * drug should read Positive, below it Negative. The lab states which, and the
 * interpretation the control is checked against follows from it.
 */
export type ToxCutOffOperator = '>=' | '<'

export const TOX_CUT_OFF_OPERATORS: { value: ToxCutOffOperator; label: string }[] = [
  { value: '>=', label: 'At or above cut-off' },
  { value: '<', label: 'Below cut-off' },
]

export function interpretationForToxOperator(
  operator: ToxCutOffOperator,
): 'Positive' | 'Negative' {
  return operator === '>=' ? 'Positive' : 'Negative'
}

export interface ToxDrugExpectation {
  id: string
  drug: string
  /** What this drug has to reach on this control, in the panel's unit. */
  cutOff: string
}

export interface ToxControlConfig {
  id: string
  controlType: ToxControlType
  /**
   * The sample name the instrument writes for this control — 'L1', 'QC L',
   * 'QC N', 'Cal_1'. This is what the parser matches an injection against.
   */
  control: string
  /** Calibrator level. Ordering the curve depends on it. */
  level?: string
  scope: ToxControlScope
  /**
   * Which side of the cut-off this control is expected to land on. It decides
   * the expected interpretation and is what the run is validated against.
   */
  operator: ToxCutOffOperator
  /** The cut-off applied to every drug, when the control is not drug-scoped. */
  cutOff?: string
  /** Per-drug cut-offs, when the control is scoped to named drugs. */
  drugs?: ToxDrugExpectation[]
  failureBehavior: ToxControlFailureBehavior
}

export const TOX_CONTROL_TYPES: ToxControlType[] = ['Calibrator', 'QC', 'Blank']

export const TOX_CONTROL_TYPE_TO_POSITION: Record<ToxControlType, PositionType> = {
  Calibrator: 'Cal',
  QC: 'QC',
  Blank: 'Blank',
}

export interface ToxControlFormData {
  controlType: ToxControlType
  control: string
  level: string
  scope: ToxControlScope
  operator: ToxCutOffOperator
  cutOff: string
  drugs: ToxDrugExpectation[]
  failureBehavior: ToxControlFailureBehavior
}
