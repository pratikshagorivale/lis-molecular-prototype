import {
  FIELD_MAPPINGS,
  RAW_FILE_PREVIEW,
  RUN_DATE,
  DEVICE,
  PLATE_ID,
  UPLOADED_FILE,
  activityLogEntries,
  buildPlateWells,
  previewRows,
  sampleGroups,
} from './mockData'
import type { FieldMapping, ParsedUploadData, QcBanner, SampleGroup, WellData } from '../types'

/** Plate whose Positive Control failed — exercises the QC-failure and CAPA paths. */
export const FAILED_QC_DEMO_PLATE_ID = 'PLATE 9'
const FAILED_QC_RUN_DATE = '7 Aug 2026'
const FAILED_QC_FILE = 'QuantStudio_Plate9_070826.xlsx'

/** Demo plates that can be opened in validation from the All Plates tab. */
export const DEMO_PLATE_IDS = [PLATE_ID, FAILED_QC_DEMO_PLATE_ID]

const PASSING_QC_BANNER: QcBanner = {
  pcPassed: true,
  ncPassed: true,
  ntcPassed: true,
  icPassed: true,
  pcPresent: true,
  ncPresent: true,
  ntcPresent: true,
  icPresent: false,
  qcPassed: true,
  failedControlWells: [],
  status: 'Valid',
}

const FAILED_QC_BANNER: QcBanner = {
  ...PASSING_QC_BANNER,
  pcPassed: false,
  qcPassed: false,
  failedControlWells: [{ wellId: 'A10', controlType: 'PC', sampleId: 'PC', label: 'PC' }],
  status: 'Needs review',
}

/** Mark the Positive Control well at A10 as having failed to amplify. */
function failPositiveControl(well: WellData): WellData {
  if (well.wellId !== 'A10') return well
  return {
    ...well,
    qcStatus: 'QC Failed',
    controlFailed: true,
    controlsPassed: false,
    ctValues: [{ target: 'Positive Control', ct: 'Undetermined', interpretation: 'Inconclusive' }],
    targetRows: [
      {
        target: 'Positive Control',
        result: 'Undetermined',
        interpretation: 'Inconclusive',
        status: 'Error',
      },
    ],
    validationErrors: ['Positive Control did not amplify — expected Ct <= 30'],
  }
}

function retagWells(wells: WellData[], plateId: string, qcFailed: boolean): WellData[] {
  return wells.map((well) => {
    const retagged: WellData = { ...well, plateId }
    return qcFailed ? failPositiveControl(retagged) : retagged
  })
}

function retagSampleGroups(groups: SampleGroup[], plateId: string): SampleGroup[] {
  return groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({ ...row, plateId })),
  }))
}

/**
 * Demo validation payload so the Molecular tab is reachable without re-uploading.
 * Pass a plate ID to load that demo plate; PLATE 9 comes back with a failed
 * Positive Control so the QC-failure and CAPA flows can be exercised.
 */
export function buildDemoUploadData(plateId: string = PLATE_ID): ParsedUploadData {
  const qcFailed = plateId === FAILED_QC_DEMO_PLATE_ID
  const runDate = qcFailed ? FAILED_QC_RUN_DATE : RUN_DATE
  const plateWells = retagWells(buildPlateWells(), plateId, qcFailed)
  const groups = retagSampleGroups(sampleGroups, plateId)
  const validSamples = groups.filter((g) => g.sampleValid).length

  return {
    fileName: qcFailed ? FAILED_QC_FILE : UPLOADED_FILE,
    rawText: RAW_FILE_PREVIEW,
    fieldMappings: FIELD_MAPPINGS as FieldMapping[],
    previewRows,
    plateSummary: {
      plateId,
      device: DEVICE,
      runDate,
      totalWells: plateWells.length,
      mappedSamples: groups.length,
      controls: plateWells.filter((w) => w.isQc).length,
      errors: groups.filter((g) => !g.sampleValid).length,
    },
    validationSummary: {
      validSamples,
      unknownSampleIds: groups.filter((g) => g.patient === 'Not Found').length,
      duplicateWells: 0,
      missingControls: 0,
    },
    sampleGroups: groups,
    plateWells,
    activityLog: activityLogEntries,
    qcBanner: qcFailed ? FAILED_QC_BANNER : PASSING_QC_BANNER,
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
