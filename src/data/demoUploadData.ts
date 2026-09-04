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
import type { FieldMapping, ParsedUploadData } from '../types'

/** Demo validation payload so Molecular / Pending Plates tabs are reachable without re-upload. */
export function buildDemoUploadData(): ParsedUploadData {
  const plateWells = buildPlateWells()
  const validSamples = sampleGroups.filter((g) => g.sampleValid).length

  return {
    fileName: UPLOADED_FILE,
    rawText: RAW_FILE_PREVIEW,
    fieldMappings: FIELD_MAPPINGS as FieldMapping[],
    previewRows,
    plateSummary: {
      plateId: PLATE_ID,
      device: DEVICE,
      runDate: RUN_DATE,
      totalWells: plateWells.length,
      mappedSamples: sampleGroups.length,
      controls: plateWells.filter((w) => w.isQc).length,
      errors: sampleGroups.filter((g) => !g.sampleValid).length,
    },
    validationSummary: {
      validSamples,
      unknownSampleIds: sampleGroups.filter((g) => g.patient === 'Not Found').length,
      duplicateWells: 0,
      missingControls: 0,
    },
    sampleGroups,
    plateWells,
    activityLog: activityLogEntries,
    qcBanner: {
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
    },
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
