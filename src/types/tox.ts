/**
 * Toxicology batch model.
 *
 * Deliberately separate from the molecular `WellData` types, but the same
 * shape: one position, one set of results. What differs is that results are
 * quantitative — a drug is not detected/not-detected, it has a concentration
 * that sits above or below a cut-off.
 *
 * A run that acquires the same well twice keeps the later acquisition.
 */

/** Agilent exports a plate grid; Shimadzu exports a linear autosampler rack. */
export type BatchLayout = 'grid' | 'rack'

/** What a position holds — a calibrator, a QC, a blank, or a patient sample. */
export type PositionType = 'Cal' | 'QC' | 'Blank' | 'Sample'


export type CompoundVerdict =
  | 'Negative'
  | 'Positive'
  | 'Over Curve'
  | 'Below LLOQ'

export interface IonRatio {
  set: number
  actual: number
  percentDiff: number
}

export interface CompoundResult {
  compound: string
  concentration: number | null
  unit: string
  retentionTime: number | null
  /** Cal and QC injections only — the back-calculated recovery. */
  accuracy: number | null
  /**
   * The nominal concentration, when the file states it outright. Preferred over
   * deriving it from found / accuracy, and it is the only way to build a curve
   * from an export that has no calibrator-level column.
   */
  expected: number | null
  cutOff: number | null
  lloq: number | null
  uloq: number | null
  verdict: CompoundVerdict
  istdArea: number | null
  ionRatio: IonRatio | null
  signalToNoise: number | null
  /** Vendor flag codes — Shimadzu 'SN' | 'IR' | 'RRT%' | 'AC', Agilent '!'. */
  flags: string[]
  /**
   * Every column in the file that is not bound to a system field, kept as-is
   * and shown in the position drawer. This is how vendor-specific detail
   * survives mapping instead of being discarded.
   */
  extras: Record<string, string>
}

/**
 * One acquisition, as the parser reads it out of the file.
 *
 * Internal to parsing: both vendor shapes un-pivot to one of these per
 * acquisition × compound before anything is grouped onto a plate.
 */
export interface Injection {
  injectionId: string
  sequence: number
  type: PositionType
  /** Calibrator level, 1-based. Null for everything else. */
  level: number | null
  /** Control name as the instrument wrote it — 'L1', 'QC L', 'Cal_3'. */
  controlName: string
  acquiredAt: string
  results: CompoundResult[]
  flags: string[]
}

export interface BatchPosition {
  /** 'D2' on a grid, '17' on a rack. */
  positionId: string
  /** 'P1' / 'P4' on a grid, the tray number on a rack. */
  plateId: string
  row: string
  column: number
  sampleId: string
  patient: string
  accessionNumber: string
  type: PositionType
  /** Calibrator level, 1-based. Null for everything else. */
  level: number | null
  /** Control name as the instrument wrote it — 'L1', 'QC L', 'Cal_3'. */
  controlName: string
  acquiredAt: string
  results: CompoundResult[]
  flags: string[]
  positivesCount: number
  requiresDilution: boolean
}

export interface CalibrationLevel {
  level: number
  expected: number
  found: number
}

/**
 * The measuring range for one drug, recovered from the calibrators on the run.
 *
 * It states what the method can measure, nothing more — whether a control was
 * acceptable is decided by its configured cut-off, not by the curve.
 */
export interface CalibrationCurve {
  compound: string
  levels: CalibrationLevel[]
  lloq: number | null
  uloq: number | null
}

/**
 * How one configured control performed on this run.
 *
 * `failedCompounds` is what drives the blast radius: the control's configured
 * failure behaviour decides whether those drugs are voided across the plate or
 * the plate itself is failed.
 */
export interface ControlOutcome {
  /** The control's name as configured — 'L1', 'QC L', 'QC N'. */
  name: string
  positionId: string
  type: PositionType
  /** What the control's operator says every drug on it should read. */
  expected: 'Positive' | 'Negative'
  failedCompounds: string[]
  /** How many drugs this control was judged on at all. */
  compoundCount: number
  passed: boolean
  detail: string
  /** From the control's configuration; decides how far a failure reaches. */
  failureBehavior: 'fail-plate' | 'fail-drug'
}

export type ToxBatchStatus = 'Pending' | 'Partially Released' | 'Released' | 'Rejected'

export interface ToxBatch {
  batchId: string
  /** Source columns carried through to the drawer, in file order. */
  extraColumns: string[]
  /** Set only when the filename's batch number disagrees with the acquisition batch. */
  fileBatchId?: string
  fileName: string
  /** Which template parsed this batch — traceability for a re-read. */
  templateId: string
  templateLabel: string
  assayRole: 'screening' | 'confirmation'
  instrument: string
  panel: string
  runDate: string
  layout: BatchLayout
  /** 96 or 384 when the addresses form a grid; null for a rack. */
  plateSize: 96 | 384 | null
  plateIds: string[]
  positions: BatchPosition[]
  curves: CalibrationCurve[]
  /** Every configured control, with how it performed. */
  controlOutcomes: ControlOutcome[]
  /** True when a control configured to fail the plate failed. */
  qcPassed: boolean
  /** Analyte names only — ISTDs are excluded. */
  compounds: string[]
  /** Drugs voided across the plate by a failed control. */
  /** Every drug that cannot be reported on this run, for any reason. */
  voidedCompounds: string[]
  /**
   * The subset voided by a control that failed. A sample carrying one of these
   * is invalid: its result for that drug was measured against a control the
   * run could not stand behind.
   */
  controlVoidedCompounds: string[]
  unit: string
  status: ToxBatchStatus
  warnings: string[]
}

