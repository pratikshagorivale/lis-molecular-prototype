import type {
  Interpretation,
  ParsedUploadData,
  PlateControlKey,
  PlateRecord,
  PlateSampleRef,
  QcBanner,
  ResultRow,
  SampleGroup,
  WellData,
  WellTargetRow,
} from '../types'
import { bannerFromControls } from '../utils/qcFailures'

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

/** Reserved for controls, so sample wells never collide with them. */
export const CONTROL_WELLS: Record<Exclude<PlateControlKey, 'IC'>, string> = {
  PC: 'H10',
  NC: 'H11',
  NTC: 'H12',
}

const ORGANISMS = [
  'Escherichia coli',
  'Klebsiella pneumoniae',
  'Proteus mirabilis',
  'Enterococcus faecalis',
  'Pseudomonas aeruginosa',
]

const GENES = ['blaTEM', 'blaCTX-M', 'blaKPC', 'vanA', 'mecA']

const RESISTANCE: Record<string, string> = {
  blaTEM: 'Cefotaxime/Ceftriaxone',
  'blaCTX-M': 'Ceftazidime/Ceftriaxone',
  blaKPC: 'Imipenem/Meropenem',
  vanA: 'Vancomycin/Teicoplanin',
  mecA: 'Oxacillin/Methicillin',
}

interface SampleTarget {
  name: string
  type: 'Organism' | 'Gene'
  ct: number | string
  interpretation: Interpretation
}

/** Deterministic target panel per sample, so a plate renders the same on every load. */
function targetsForSample(index: number): SampleTarget[] {
  const organismCount = 1 + (index % 2)
  const geneCount = 1 + (index % 3)
  const targets: SampleTarget[] = []

  for (let i = 0; i < organismCount; i += 1) {
    const detected = (index + i) % 4 !== 0
    targets.push({
      name: ORGANISMS[(index + i) % ORGANISMS.length],
      type: 'Organism',
      ct: detected ? 18 + ((index * 3 + i * 5) % 14) : 'Undetermined',
      interpretation: detected ? 'Detected' : 'Not Detected',
    })
  }

  for (let i = 0; i < geneCount; i += 1) {
    const detected = (index + i) % 3 !== 0
    targets.push({
      name: GENES[(index + i) % GENES.length],
      type: 'Gene',
      ct: detected ? 20 + ((index * 2 + i * 7) % 13) : 'Undetermined',
      interpretation: detected ? 'Detected' : 'Not Detected',
    })
  }

  return targets
}

function wellStatusFor(sample: PlateSampleRef): WellData['status'] {
  if (sample.status === 'Failed') return 'failed'
  if (sample.status === 'Needs Review') return 'review'
  return 'ready'
}

function targetRows(targets: SampleTarget[]): WellTargetRow[] {
  return targets.map((t) => ({
    target: t.name,
    result: t.ct,
    interpretation: t.interpretation,
    status: t.interpretation === 'Detected' ? 'Valid' : 'Warning',
  }))
}

function sampleWell(
  sample: PlateSampleRef,
  index: number,
  plate: PlateRecord,
  icFailedWells: Set<string>,
): WellData {
  const targets = targetsForSample(index)
  const detected = targets.filter((t) => t.interpretation === 'Detected')
  const notDetected = targets.filter((t) => t.interpretation !== 'Detected')
  const icFailed = icFailedWells.has(sample.wellId)

  return {
    wellId: sample.wellId,
    plateId: plate.plateId,
    runDate: plate.runDate,
    sampleId: sample.sampleId,
    accessionNumber: sample.accessionNumber,
    patient: sample.patient,
    testOrder: sample.accessionNumber,
    panel: 'UTI Panel',
    isQc: false,
    qcType: '',
    status: wellStatusFor(sample),
    label: sample.sampleId,
    qcStatus: icFailed ? 'QC Failed' : 'QC Passed',
    totalTargetCount: targets.length,
    detectedCount: detected.length,
    notDetectedCount: notDetected.length,
    detectedTargets: detected.map((t) => t.name),
    notDetectedTargets: notDetected.map((t) => t.name),
    targetRows: targetRows(targets),
    controlValidations: [],
    ctValues: targets.map((t) => ({ target: t.name, ct: t.ct, interpretation: t.interpretation })),
    validationChecks: [
      { label: 'Sample ID matched in LIS', passed: sample.status !== 'Failed' },
      { label: 'Internal Control within limits', passed: !icFailed },
    ],
    validationErrors: icFailed
      ? ['Internal Control below cut-off — result may be affected by inhibition']
      : undefined,
    isFailed: sample.status === 'Failed',
    controlsPassed: !icFailed,
    affectedByTargetedControlFailure: icFailed,
  }
}

function controlWell(
  control: Exclude<PlateControlKey, 'IC'>,
  plate: PlateRecord,
  failed: boolean,
): WellData {
  const wellId = CONTROL_WELLS[control]
  const target = control === 'PC'
    ? 'Positive Control'
    : control === 'NC' ? 'Negative Control' : 'No Template Control'

  // A passing PC amplifies; NC and NTC pass by staying undetected.
  const expectedCt: number | string = control === 'PC' ? 22 : '-'
  const ct = failed ? (control === 'PC' ? 'Undetermined' : 32.4) : expectedCt
  const interpretation: Interpretation = failed ? 'Inconclusive' : 'Passed'

  return {
    wellId,
    plateId: plate.plateId,
    runDate: plate.runDate,
    sampleId: control,
    accessionNumber: '',
    patient: '',
    testOrder: '',
    panel: 'Control',
    isQc: true,
    qcType: control,
    status: 'control',
    label: control,
    qcStatus: failed ? 'QC Failed' : 'QC Passed',
    totalTargetCount: 1,
    detectedCount: failed && control !== 'PC' ? 1 : 0,
    notDetectedCount: failed && control !== 'PC' ? 0 : 1,
    detectedTargets: [],
    notDetectedTargets: [target],
    targetRows: [{
      target,
      result: ct,
      interpretation,
      status: failed ? 'Error' : 'Valid',
    }],
    controlValidations: [],
    ctValues: [{ target, ct, interpretation }],
    validationChecks: [],
    validationErrors: failed
      ? [plate.qcControls.find((c) => c.control === control)?.summary ?? `${control} outside configured limits`]
      : undefined,
    isFailed: false,
    controlFailed: failed,
    controlsPassed: !failed,
  }
}

function emptyWell(wellId: string, plate: PlateRecord): WellData {
  return {
    wellId,
    plateId: plate.plateId,
    runDate: plate.runDate,
    sampleId: '',
    accessionNumber: '',
    patient: '',
    testOrder: '',
    panel: '',
    isQc: false,
    qcType: '',
    status: 'empty',
    label: '',
    qcStatus: 'QC Passed',
    detectedTargets: [],
    notDetectedTargets: [],
    targetRows: [],
    controlValidations: [],
    ctValues: [],
    validationChecks: [],
    isFailed: false,
  }
}

function sampleGroupFor(well: WellData, sample: PlateSampleRef, plate: PlateRecord): SampleGroup {
  const rows: ResultRow[] = well.targetRows.map((row) => ({
    well: well.wellId,
    plateId: plate.plateId,
    targetName: row.target,
    ctValue: row.result,
    interpretation: row.interpretation,
    type: row.target in RESISTANCE ? 'Gene' : 'Organism',
    resistantAntibiotics: row.interpretation === 'Detected' ? (RESISTANCE[row.target] ?? '-') : '-',
    sensitiveAntibiotics: row.interpretation === 'Detected' ? '-' : 'Meropenem',
    status: sample.status,
    controlPassed: Boolean(well.controlsPassed),
  }))

  return {
    sampleId: sample.sampleId,
    patient: sample.patient,
    testOrder: sample.accessionNumber,
    panel: 'UTI Panel',
    status: sample.status,
    error: sample.status === 'Failed' ? 'Sample ID not found in LIS' : undefined,
    detectedOrganisms: rows.filter((r) => r.type === 'Organism' && r.interpretation === 'Detected').length,
    resistanceGenes: rows.filter((r) => r.type === 'Gene' && r.interpretation === 'Detected').length,
    controlsPassed: Boolean(well.controlsPassed),
    sampleValid: sample.status === 'Ready for Release',
    rows,
    selected: sample.status === 'Ready for Release',
  }
}

/**
 * The banner comes straight from the plate's control list. IC has no control well,
 * so its failure is pinned to the sample wells it was measured in.
 */
function bannerFor(plate: PlateRecord, icFailedWells: string[]): QcBanner {
  const controls = plate.qcControls.map((control) => (
    control.control === 'IC' && !control.passed
      ? { ...control, wells: icFailedWells }
      : control
  ))
  return bannerFromControls(controls)
}

function failedControlKeys(plate: PlateRecord): PlateControlKey[] {
  return plate.qcControls.filter((control) => !control.passed).map((control) => control.control)
}

/** Build a full validation payload from a registry plate, so its own samples are shown. */
export function buildUploadDataForPlate(plate: PlateRecord): ParsedUploadData {
  const failed = failedControlKeys(plate)
  // An Internal Control failure is measured inside sample wells, not a dedicated control well.
  const icFailedWells = failed.includes('IC')
    ? plate.samples.filter((s) => s.status !== 'Ready for Release').map((s) => s.wellId)
    : []
  const icFailedSet = new Set(icFailedWells)

  const sampleWells = plate.samples.map((sample, i) => sampleWell(sample, i, plate, icFailedSet))
  const wellsById = new Map(sampleWells.map((w) => [w.wellId, w]))

  for (const key of ['PC', 'NC', 'NTC'] as const) {
    wellsById.set(CONTROL_WELLS[key], controlWell(key, plate, failed.includes(key)))
  }

  const plateWells: WellData[] = []
  for (const row of ROWS) {
    for (const col of COLS) {
      const wellId = `${row}${col}`
      plateWells.push(wellsById.get(wellId) ?? emptyWell(wellId, plate))
    }
  }

  const groups = plate.samples.map((sample, i) => sampleGroupFor(sampleWells[i], sample, plate))

  return {
    fileName: `${plate.plateId.replace(/\s+/g, '_')}_results.xlsx`,
    rawText: '',
    fieldMappings: [],
    previewRows: [],
    plateSummary: {
      plateId: plate.plateId,
      device: plate.instrument,
      runDate: plate.runDate,
      totalWells: plateWells.length,
      mappedSamples: groups.length,
      controls: 3,
      errors: groups.filter((g) => !g.sampleValid).length,
    },
    validationSummary: {
      validSamples: groups.filter((g) => g.sampleValid).length,
      unknownSampleIds: groups.filter((g) => g.status === 'Failed').length,
      duplicateWells: 0,
      missingControls: 0,
    },
    sampleGroups: groups,
    plateWells,
    activityLog: [],
    qcBanner: bannerFor(plate, icFailedWells),
    plateViewReadiness: {
      canFormPlate: true,
      wellColumnMapped: true,
      plateIdAvailable: true,
    },
    mappedTargetMetrics: {
      thresholdValue: false,
      reporterDye: false,
      cqConfidence: false,
    },
    sourceRecords: [],
    defaultPanel: 'UTI Panel',
    plateSize: 96,
  }
}
