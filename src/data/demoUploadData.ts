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
import type { FieldMapping, ParsedUploadData, QcBanner } from '../types'

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

/** Hand-authored AB1P demo payload, so the Molecular tab is reachable without re-uploading. */
export function buildDemoUploadData(): ParsedUploadData {
  const plateId = PLATE_ID
  const runDate = RUN_DATE
  const plateWells = buildPlateWells()
  const groups = sampleGroups
  const validSamples = groups.filter((g) => g.sampleValid).length

  return {
    fileName: UPLOADED_FILE,
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
    qcBanner: PASSING_QC_BANNER,
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
