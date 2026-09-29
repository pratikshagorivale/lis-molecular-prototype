import type { PlateSize } from './index'
import type { PositionType } from './tox'

/**
 * A file template: the definition of one backend parser.
 *
 * Labs send us a sample export, we write the parser, and it ships as a named
 * template in the catalogue below. The technologist picks the template that
 * matches their instrument and uploads the file — there is no mapping to do,
 * because the parser already knows the format.
 *
 * The survey behind this model found six structural variants across five
 * vendors, and five properties that vary independently of layout — the result
 * column's name, header language, which columns the analyst had visible,
 * delimiter and encoding, and the sample-type vocabulary. Each part below
 * exists because one of those would otherwise need a new parser.
 */

// ---------------------------------------------------------------------------
// Reading the bytes
// ---------------------------------------------------------------------------

/**
 * Thermo's sequence CSV uses the Windows locale list separator, so it arrives
 * semicolon-delimited from an EU-locale instrument PC. A real SCIEX export has
 * CR-only line endings. Neither can be assumed from the file extension.
 */
export interface ReadConfig {
  delimiter: ',' | ';' | '\t' | '|' | 'auto'
  /** Sheet name or index for spreadsheet uploads. */
  sheet?: string | number
  /** Literal strings that mean "no value" — SCIEX writes 'N/A'. */
  nullTokens?: string[]
}

// ---------------------------------------------------------------------------
// Finding the header
// ---------------------------------------------------------------------------

/**
 * Thermo writes a `Bracket Type=4` line above the real header; Waters writes a
 * report title and a print timestamp. A fixed header row index cannot express
 * either, so the header may instead be found by matching its first cell.
 */
export type LocateConfig =
  | { kind: 'row'; headerRow: number; dataStartRow: number }
  | { kind: 'find'; firstCellMatches: string; offsetToHeader: number }

// ---------------------------------------------------------------------------
// Where the drug name lives
// ---------------------------------------------------------------------------

export type ShapeConfig =
  /** One row per drug per injection. Shimadzu, SCIEX. */
  | { kind: 'long' }
  /**
   * Drug names in a sparse group-header row, N columns each. Agilent.
   * 'auto' runs period detection on the sub-header row, which is how both the
   * 2-drug and the 75-drug Agilent panels resolve from one template.
   */
  | {
      kind: 'wide'
      nameRow: number
      blockStartColumn: number | 'auto'
      blockWidth: number | 'auto'
      subColumns?: string[]
      /** Stripped off each group label — Agilent appends ' Results'. */
      nameCleanup?: string
    }

// ---------------------------------------------------------------------------
// Binding columns to system fields
// ---------------------------------------------------------------------------

/**
 * `alias` is the default. `pattern` exists because Waters names the result
 * column after the units, so the header is literally 'ng/mL' and changes with
 * the method — there is no fixed name to match.
 */
export type ColumnBinding =
  | { kind: 'exact'; column: string }
  | { kind: 'alias'; aliases: string[] }
  | { kind: 'pattern'; pattern: string }
  | { kind: 'none' }

export type ToxSystemField =
  | 'sampleId'
  | 'drugName'
  | 'result'
  | 'wellPosition'
  | 'plateId'
  | 'injectionType'
  | 'level'
  | 'expectedConcentration'
  | 'accuracy'
  | 'acquired'
  | 'injectionId'
  | 'unit'
  | 'retentionTime'
  | 'istdArea'
  | 'istdName'
  | 'ionRatioSet'
  | 'ionRatioActual'
  | 'ionRatioDiff'
  | 'signalToNoise'
  | 'flags'
  | 'instrument'
  | 'acquisitionBatch'

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/**
 * Every vendor names calibrators and QCs differently — 'Std.' / 'Cal' /
 * 'Standard' / 'Cal Std' / 'Std Bracket' — and the value is what identifies a
 * control. Keys are compared case-insensitively after trimming.
 */
export type SampleTypeMap = Record<string, PositionType>

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

/**
 * Three incompatible models across vendors: one combined string with the plate
 * embedded (Agilent 'P4-A1', Waters '2:A,12', Thermo '1:A1'), two columns
 * (Shimadzu Vial + Tray), or three numerics (SCIEX rack + plate + vial). A
 * regex with named groups covers all three; `columns` supplies the inputs in
 * order and they are joined with `join` before matching.
 */
export interface PositionConfig {
  columns: string[]
  join?: string
  /** Named groups: plate, row, col — or well for an unsplit address. */
  pattern?: string
  /**
   * How the plate is labelled for display, '{plate}' substituted. Shimadzu's
   * Tray column holds a bare '5', which reads as a plate name only once it is
   * rendered as 'Tray 5'.
   */
  plateLabel?: string
  /**
   * Lay a sequential vial number onto a plate. SCIEX and similar autosamplers
   * report position as a plain integer; a lab that plated a 96-well plate and
   * loaded it whole wants wells, not a strip of 96 vials.
   */
  fill?: 'row-major'
}

// ---------------------------------------------------------------------------
// Matching a file to a template
// ---------------------------------------------------------------------------

/**
 * Header text cannot be the only signal: Shimadzu headers follow the
 * instrument PC's UI language, so an English required-column list will not
 * match a Chinese export. Shape markers and column counts are language
 * independent and carry the match when the text does not.
 */
export interface FingerprintConfig {
  requiredColumns?: string[]
  forbiddenColumns?: string[]
  /** Regex tested against the first cell of row 0. */
  firstCellPattern?: string
  /** Regex tested against any cell in row 0 — e.g. Agilent's ' Results'. */
  anyFirstRowPattern?: string
  /** Tie-breaker only. Filenames are the least reliable thing in this data. */
  filenamePattern?: string
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

export interface ToxFileTemplate {
  id: string
  label: string
  /** One line in the picker: what this parser is for. */
  description: string
  vendorHint?: string
  version: number
  /**
   * Whether this device screens or confirms. Drives the S / C badge on the
   * results table — a domain fact about the method, not about the vendor.
   */
  assayRole: 'screening' | 'confirmation'
  read: ReadConfig
  locate: LocateConfig
  shape: ShapeConfig
  fields: Partial<Record<ToxSystemField, ColumnBinding>>
  sampleTypes: SampleTypeMap
  position: PositionConfig
  plateSize: PlateSize | 'auto'
  match: FingerprintConfig
}

/** How well a template fits a file, and why — surfaced in the upload modal. */
export interface TemplateMatch {
  template: ToxFileTemplate
  score: number
  reasons: string[]
}

/**
 * Whether the chosen template can read the chosen file.
 *
 * With no mapping step, this check is the only thing standing between a
 * mismatched file and a confidently wrong batch, so it reports what is missing
 * and which template would have worked.
 */
export interface TemplateFileCheck {
  ok: boolean
  missingColumns: string[]
  /** A template that does fit, when the chosen one does not. */
  suggestion?: ToxFileTemplate
  detail: string
}
