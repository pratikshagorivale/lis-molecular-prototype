import type { ToxFileTemplate } from '../types/toxTemplate'

/**
 * The parser catalogue.
 *
 * Each entry is a parser written against a real export a lab sent us. The
 * technologist picks one at upload; nothing is mapped in the UI. Adding a
 * fourth instrument means adding an entry here, not changing the app.
 */

export const AGILENT_MASSHUNTER_WIDE: ToxFileTemplate = {
  id: 'agilent-masshunter-wide',
  label: 'Agilent MassHunter Quant',
  description: 'Confirmation panels. Compound results in column groups, position as P<plate>-<well>.',
  vendorHint: 'Agilent',
  version: 1,
  assayRole: 'confirmation',

  read: { delimiter: 'auto' },
  // Row 0 holds the compound group labels, row 1 the sub-headers, data from 2.
  locate: { kind: 'row', headerRow: 1, dataStartRow: 2 },
  shape: {
    kind: 'wide',
    nameRow: 0,
    // Period detection resolves both the 2-drug and the 75-drug panels, so one
    // template covers every Agilent file we have.
    blockStartColumn: 'auto',
    blockWidth: 'auto',
    nameCleanup: '\\s*Results\\s*$',
  },

  fields: {
    sampleId: { kind: 'alias', aliases: ['Name', 'Sample Name'] },
    drugName: { kind: 'exact', column: 'Compound' },
    // Final Conc. is post-dilution; Calc. Conc. is the pre-multiplier value.
    // Both exist across MassHunter methods, so accept either.
    result: { kind: 'alias', aliases: ['Final Conc.', 'Calc. Conc.'] },
    wellPosition: { kind: 'exact', column: 'Pos.' },
    plateId: { kind: 'exact', column: 'Plate' },
    injectionType: { kind: 'exact', column: 'Type' },
    level: { kind: 'exact', column: 'Level' },
    accuracy: { kind: 'exact', column: 'Accuracy' },
    acquired: { kind: 'exact', column: 'Acq. Date-Time' },
    injectionId: { kind: 'exact', column: 'Data File' },
    retentionTime: { kind: 'exact', column: 'RT' },
    flags: { kind: 'exact', column: 'Flags' },
  },

  sampleTypes: {
    cal: 'Cal',
    standard: 'Cal',
    'std.': 'Cal',
    qc: 'QC',
    blank: 'Blank',
    sample: 'Sample',
    unknown: 'Sample',
  },

  // 'P4-A1' — plate and well in one cell.
  position: {
    columns: ['Pos.'],
    pattern: '^(?<plate>.+?)[-_](?<row>[A-Za-z])(?<col>\\d{1,2})$',
  },

  plateSize: 'auto',

  match: {
    requiredColumns: ['Name', 'Type', 'Pos.'],
    firstCellPattern: '^Sample$',
    anyFirstRowPattern: 'Results\\s*$',
  },
}

export const SHIMADZU_LABSOLUTIONS_LONG: ToxFileTemplate = {
  id: 'shimadzu-labsolutions-long',
  label: 'Shimadzu LabSolutions',
  description: 'Screening panels. One row per compound, position split across Tray and Vial.',
  vendorHint: 'Shimadzu',
  version: 1,
  assayRole: 'screening',

  read: { delimiter: 'auto', nullTokens: ['N/A', '--', 'NC'] },
  locate: { kind: 'row', headerRow: 0, dataStartRow: 1 },
  shape: { kind: 'long' },

  fields: {
    sampleId: { kind: 'exact', column: 'Sample Name' },
    drugName: { kind: 'exact', column: 'Compound' },
    result: { kind: 'exact', column: 'Conc.' },
    wellPosition: { kind: 'exact', column: 'Vial' },
    plateId: { kind: 'exact', column: 'Tray' },
    // 'Sample Type' not 'Type': LabSolutions also exports a peak-type column
    // called 'Type' holding 'Target', which would hide every calibrator.
    injectionType: { kind: 'exact', column: 'Sample Type' },
    level: { kind: 'exact', column: 'Level' },
    accuracy: { kind: 'exact', column: 'Accuracy(%)' },
    acquired: { kind: 'exact', column: 'Acquired Date' },
    injectionId: { kind: 'exact', column: 'Data Filename' },
    unit: { kind: 'exact', column: 'Unit' },
    retentionTime: { kind: 'exact', column: 'RT' },
    istdArea: { kind: 'exact', column: 'ISTD Area' },
    istdName: { kind: 'exact', column: 'ISTD Name' },
    ionRatioSet: { kind: 'exact', column: 'Ref 1 Set Ratio' },
    ionRatioActual: { kind: 'exact', column: 'Ref 1 Actual Ratio' },
    ionRatioDiff: { kind: 'exact', column: 'Ref 1 Std Ratio %Diff' },
    signalToNoise: { kind: 'exact', column: 'S/N' },
    flags: { kind: 'exact', column: 'Flag ID' },
    instrument: { kind: 'exact', column: 'Instrument Name' },
    acquisitionBatch: { kind: 'exact', column: 'Acquisition Batch' },
  },

  sampleTypes: {
    'std.': 'Cal',
    std: 'Cal',
    standard: 'Cal',
    'unk.': 'Sample',
    unk: 'Sample',
    unknown: 'Sample',
    qc: 'QC',
    'quality control': 'QC',
    blank: 'Blank',
  },

  // Tray and Vial are separate columns; the tray gets a readable name.
  position: {
    columns: ['Tray', 'Vial'],
    join: '|',
    pattern: '^(?<plate>[^|]*)\\|(?<well>.*)$',
    plateLabel: 'Tray {plate}',
  },

  plateSize: 'auto',

  match: {
    requiredColumns: ['Compound', 'Data Filename', 'Sample Type'],
    forbiddenColumns: ['Pos.'],
  },
}

/**
 * Written against a SCIEX OS drugs-of-abuse export. Awkward in three ways that
 * a parser has to absorb so the UI never has to: tab-delimited with a .txt
 * extension, CR-only line endings, and no calibrator-level column — the levels
 * are recovered by ranking the stated nominal concentrations.
 */
export const SCIEX_OS_DOA: ToxFileTemplate = {
  id: 'sciex-os-doa',
  label: 'SCIEX OS — drugs of abuse',
  description: 'Tab-delimited results table. Vial numbers laid onto a 96-well plate row by row.',
  vendorHint: 'SCIEX',
  version: 1,
  assayRole: 'confirmation',

  read: { delimiter: '\t', nullTokens: ['N/A'] },
  locate: { kind: 'row', headerRow: 0, dataStartRow: 1 },
  shape: { kind: 'long' },

  fields: {
    sampleId: { kind: 'exact', column: 'Sample Name' },
    drugName: { kind: 'exact', column: 'Component Name' },
    result: { kind: 'exact', column: 'Calculated Concentration' },
    expectedConcentration: { kind: 'exact', column: 'Actual Concentration' },
    wellPosition: { kind: 'exact', column: 'Vial Number' },
    plateId: { kind: 'exact', column: 'Plate Number' },
    injectionType: { kind: 'exact', column: 'Sample Type' },
    acquired: { kind: 'exact', column: 'Acquisition Date' },
    retentionTime: { kind: 'exact', column: 'Retention Time' },
    istdArea: { kind: 'exact', column: 'IS Area' },
    ionRatioActual: { kind: 'exact', column: 'Ion Ratio' },
    signalToNoise: { kind: 'exact', column: 'Signal / Noise' },
    instrument: { kind: 'exact', column: 'Instrument Name' },
  },

  sampleTypes: {
    standard: 'Cal',
    'quality control': 'QC',
    blank: 'Blank',
    'double blank': 'Blank',
    solvent: 'Blank',
    unknown: 'Sample',
  },

  // A plain vial number, laid onto the plate the run was pipetted into.
  position: { columns: [], fill: 'row-major', plateLabel: 'Plate {plate}' },
  plateSize: 96,

  match: {
    requiredColumns: ['Sample Name', 'Component Name', 'Calculated Concentration', 'Vial Number'],
  },
}

/** Every parser the product ships. Ordered as the picker shows them. */
export const TOX_TEMPLATE_CATALOGUE: ToxFileTemplate[] = [
  AGILENT_MASSHUNTER_WIDE,
  SHIMADZU_LABSOLUTIONS_LONG,
  SCIEX_OS_DOA,
]

/** @deprecated use TOX_TEMPLATE_CATALOGUE */
export const SEEDED_TOX_TEMPLATES = TOX_TEMPLATE_CATALOGUE
