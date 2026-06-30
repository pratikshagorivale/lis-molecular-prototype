import { isUnknownSample, lookupSample } from './lisSampleRegistry'
import { isPositiveResult, parseInterpretation } from '../utils/interpretation'
import { controlLabel, evaluatePlateQc, getPlateControlValidations, isControlRecord, isPlateControlWell, type PlateQcEvaluation } from '../utils/qcDetection'
import {
  evaluatePlateQcFromConfig,
  findWellsForConfig,
  getConfiguredPlateControlValidations,
} from '../utils/controlEvaluation'
import { isValidPlateWell, normalizeWell } from '../utils/wellPosition'
import type { RawMolecularRow } from '../utils/parseMolecularFile'
import type {
  ActivityLogEntry,
  FieldMapping,
  InstrumentControlConfig,
  ParsedUploadData,
  PlateSummary,
  PreviewRow,
  QcBanner,
  ResultRow,
  SampleGroup,
  SampleStatus,
  ValidationStatus,
  ValidationSummary,
  WellAdditionalMetrics,
  WellControlValidation,
  WellData,
  WellQcStatus,
  WellStatus,
  WellTargetRow,
  PlateSize,
  PlateViewReadiness,
} from '../types'
import { AVAILABLE_TARGETS } from './instrumentManagementMockData'
import {
  computeAffectedTargetsFromFailedTargetedControls,
  normalizeTargetName,
  wellTestsAffectedTarget,
} from '../utils/targetedControlImpact'

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

const GENE_ABX: Record<string, { resistant?: string; sensitive?: string }> = {
  blaTEM: { resistant: 'Cefotaxime/Ceftriaxone' },
  'blaCTX-M': { resistant: 'Ceftazidime/Ceftriaxone' },
  'blaNDM-1': { sensitive: 'Meropenem' },
  blaKPC: { resistant: 'Imipenem/Meropenem' },
  blaVIM: { sensitive: 'Meropenem' },
  vanA: { resistant: 'Vancomycin/Teicoplanin' },
}

interface BuildInput {
  fileName: string
  rawText: string
  fieldMappings: FieldMapping[]
  records: RawMolecularRow[]
  device: string
  plateId: string
  runDate: string
  defaultPanel: string
  plateSize?: PlateSize
  instrumentControls?: InstrumentControlConfig[]
  plateViewReadiness: PlateViewReadiness
}

function nowTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function hasFileContext(row: RawMolecularRow): boolean {
  return !!(row.patient || row.testOrder || (row.panel && row.panel !== 'Control'))
}

function rowValidationStatus(row: RawMolecularRow, isDuplicate: boolean): ValidationStatus {
  if (isControlRecord(row)) return 'Valid'
  if (isUnknownSample(row.sampleId)) return 'Error'
  if (hasFileContext(row) || lookupSample(row.sampleId)) {
    if (isDuplicate) return 'Warning'
    return 'Valid'
  }
  return 'Warning'
}

function sampleStatus(rows: RawMolecularRow[]): SampleStatus {
  const first = rows[0]
  if (isControlRecord(first)) return 'Ready'
  const sampleId = first.sampleId
  if (isUnknownSample(sampleId)) return 'Failed'
  if (hasFileContext(first) || lookupSample(sampleId)) return 'Ready for Release'
  return 'Needs Review'
}

function wellStatusForRow(row: RawMolecularRow): WellStatus {
  if (isControlRecord(row)) return 'control'
  if (isUnknownSample(row.sampleId)) return 'failed'
  if (hasFileContext(row) || lookupSample(row.sampleId)) return 'ready'
  return 'review'
}

function mapWellQcStatus(status: PlateQcEvaluation['status']): WellQcStatus {
  if (status === 'QC Passed') return 'QC Passed'
  if (status === 'Failed') return 'QC Failed'
  return 'QC Warning'
}

function buildControlValidations(
  records: RawMolecularRow[],
  instrumentControls: InstrumentControlConfig[] = [],
): WellControlValidation[] {
  if (instrumentControls.length > 0) {
    return getConfiguredPlateControlValidations(records, instrumentControls, AVAILABLE_TARGETS)
  }
  return getPlateControlValidations(records)
}

function buildAdditionalMetricsFromRow(row: RawMolecularRow): WellAdditionalMetrics | undefined {
  const metrics: WellAdditionalMetrics = {}
  if (row.ampStatus) metrics.ampStatus = row.ampStatus
  if (row.ampScore) metrics.ampScore = row.ampScore
  if (row.cqConfidence) metrics.cqConfidence = row.cqConfidence
  if (row.reporterDye) metrics.reporterDye = row.reporterDye
  if (row.thresholdValue) metrics.thresholdValue = row.thresholdValue
  return Object.keys(metrics).length > 0 ? metrics : undefined
}

function buildTargetRows(records: RawMolecularRow[], isDuplicateWell: boolean): WellTargetRow[] {
  return records.map((r) => ({
    target: r.target,
    result: r.ct,
    interpretation: r.interpretation,
    status: rowValidationStatus(r, isDuplicateWell),
    additionalMetrics: buildAdditionalMetricsFromRow(r),
  }))
}

function buildPlateWellsFromRecords(
  records: RawMolecularRow[],
  plateId: string,
  defaultPanel: string,
  runDate: string,
  failedControlWellIds: Set<string> = new Set(),
  plateQc: PlateQcEvaluation,
  instrumentControls: InstrumentControlConfig[] = [],
): WellData[] {
  const byWell = new Map<string, RawMolecularRow[]>()
  const unmappedBySample = new Map<string, RawMolecularRow[]>()

  for (const r of records) {
    const wellKey = normalizeWell(r.well)
    if (isValidPlateWell(wellKey)) {
      const list = byWell.get(wellKey) ?? []
      list.push({ ...r, well: wellKey })
      byWell.set(wellKey, list)
    } else if (!isControlRecord(r)) {
      const list = unmappedBySample.get(r.sampleId) ?? []
      list.push(r)
      unmappedBySample.set(r.sampleId, list)
    }
  }

  let scan = 0
  for (const [, sampleRecords] of unmappedBySample) {
    while (scan < 96) {
      const row = ROWS[Math.floor(scan / 12)]
      const col = (scan % 12) + 1
      const wellId = `${row}${col}`
      scan++
      if (!byWell.has(wellId)) {
        byWell.set(wellId, sampleRecords.map((r) => ({ ...r, well: wellId })))
        break
      }
    }
  }

  const controlValidations = buildControlValidations(records, instrumentControls)
  const qcStatus = mapWellQcStatus(plateQc.status)
  const wellSampleDup = new Map<string, Set<string>>()
  for (const r of records) {
    if (isControlRecord(r)) continue
    const set = wellSampleDup.get(r.well) ?? new Set()
    set.add(r.sampleId)
    wellSampleDup.set(r.well, set)
  }

  const wells: WellData[] = []
  for (const row of ROWS) {
    for (const col of COLS) {
      const wellId = `${row}${col}`
      const wellRecords = byWell.get(wellId)

      if (!wellRecords?.length) {
        wells.push({
          wellId,
          plateId,
          runDate: '',
          sampleId: '',
          accessionNumber: '',
          patient: '',
          testOrder: '',
          panel: '',
          isQc: false,
          qcType: '',
          status: 'empty',
          label: '',
          qcStatus,
          detectedTargets: [],
          notDetectedTargets: [],
          targetRows: [],
          controlValidations,
          ctValues: [],
          validationChecks: [],
          isFailed: false,
        })
        continue
      }

      const first = wellRecords[0]
      const isControl = isControlRecord(first)
      const lis = lookupSample(first.sampleId)
      const status: WellStatus = isControl ? 'control' : wellStatusForRow(first)
      const targetRecords = isControl
        ? wellRecords
        : wellRecords.filter((r) => !isControlRecord(r) && r.type !== 'Control')
      const detected = targetRecords.filter((r) => isPositiveResult(r.interpretation, r.ampStatus, r.ct))
      const notDetected = targetRecords.filter((r) => !isPositiveResult(r.interpretation, r.ampStatus, r.ct))
      const totalTargetCount = targetRecords.length
      const notDetectedCount = notDetected.length
      const detectedCount = detected.length
      const ctValues = wellRecords.map((r) => ({
        target: r.target,
        ct: r.ct,
        interpretation: parseInterpretation(r.ampStatus, r.ct, { isQc: isControl }),
        ampStatus: r.ampStatus || undefined,
      }))
      const validationErrors: string[] = []
      if (!isControl) {
        if (isUnknownSample(first.sampleId)) validationErrors.push('Sample not found in LIS', 'Report not found')
        else if (!lis && !hasFileContext(first)) validationErrors.push('Report not found')
      }

      const patient = isControl
        ? controlLabel(first)
        : (first.patient || lis?.patient || 'Not Found')
      const testOrder = isControl ? '' : (first.testOrder || '')
      const panel = isControl ? 'Control' : (first.panel || lis?.panel || defaultPanel)

      const isDuplicateWell = (wellSampleDup.get(wellId)?.size ?? 0) > 1
      const targetRows = buildTargetRows(targetRecords, isDuplicateWell)
      const accessionNumber = isControl ? '' : (first.accessionNumber || first.testOrder || '')
      const controlWellFailed = isControl && failedControlWellIds.has(wellId)
      const wellQcStatus: WellQcStatus = isControl
        ? (controlWellFailed ? 'QC Failed' : 'QC Passed')
        : qcStatus

      wells.push({
        wellId,
        plateId,
        runDate: isControl ? '' : runDate,
        sampleId: first.sampleId,
        accessionNumber,
        patient,
        testOrder,
        panel,
        isQc: first.isQc,
        qcType: first.qcType,
        status,
        label: isControl ? (first.sampleId.trim() || controlLabel(first)) : first.sampleId,
        qcStatus: wellQcStatus,
        totalTargetCount,
        detectedCount,
        notDetectedCount,
        detectedTargets: detected.map((r) => r.target),
        notDetectedTargets: notDetected.map((r) => r.target),
        targetRows,
        controlValidations,
        ctValues,
        validationChecks: isControl ? [] : [
          { label: 'Sample Found', passed: !!lis || !!first.patient },
          { label: 'Ordered Test Found', passed: !!lis || !!first.testOrder },
          { label: 'Report Found', passed: !!lis || (!!first.patient && !!first.testOrder) },
          { label: 'Target Mapped', passed: true },
          { label: 'Controls Passed', passed: plateQc.qcPassed },
        ],
        validationErrors: validationErrors.length ? validationErrors : undefined,
        isFailed: status === 'failed' || controlWellFailed,
        controlFailed: controlWellFailed,
        controlsPassed: isControl ? !controlWellFailed : plateQc.qcPassed,
      })
    }
  }
  return wells
}

function targetControlPassed(
  targetName: string,
  plateQcPassed: boolean,
  affectedTargets: Set<string>,
): boolean {
  if (!plateQcPassed) return false
  return !affectedTargets.has(normalizeTargetName(targetName))
}

function buildSampleGroups(
  records: RawMolecularRow[],
  plateId: string,
  defaultPanel: string,
  qcPassed: boolean,
  affectedTargets: Set<string>,
): SampleGroup[] {
  const bySample = new Map<string, RawMolecularRow[]>()
  for (const r of records) {
    if (isControlRecord(r)) continue
    const list = bySample.get(r.sampleId) ?? []
    list.push(r)
    bySample.set(r.sampleId, list)
  }

  return Array.from(bySample.entries()).map(([sampleId, rows]) => {
    const first = rows[0]
    const lis = lookupSample(sampleId)
    const status = sampleStatus(rows)
    const organisms = rows.filter((r) => r.type === 'Organism' && isPositiveResult(r.interpretation, r.ampStatus, r.ct)).length
    const genes = rows.filter((r) => r.type === 'Gene' && isPositiveResult(r.interpretation, r.ampStatus, r.ct)).length
    const resultRows: ResultRow[] = rows.map((r) => {
      const abx = GENE_ABX[r.target] ?? {}
      const controlPassed = targetControlPassed(r.target, qcPassed, affectedTargets)
      return {
        well: r.well,
        plateId,
        targetName: r.target,
        ctValue: r.ct,
        interpretation: r.interpretation,
        ampStatus: r.ampStatus,
        type: r.type,
        resistantAntibiotics: abx.resistant ?? '-',
        sensitiveAntibiotics: abx.sensitive ?? '-',
        status: status === 'Ready for Release' ? 'Ready' : status,
        controlPassed,
      }
    })

    return {
      sampleId,
      patient: first.patient || lis?.patient || 'Not Found',
      testOrder: first.testOrder || '',
      panel: first.panel || lis?.panel || defaultPanel,
      status,
      error: status === 'Failed' ? 'Sample not found in LIS' : undefined,
      detectedOrganisms: organisms,
      resistanceGenes: genes,
      controlsPassed: qcPassed,
      sampleValid: resultRows.length > 0 && resultRows.every((row) => row.controlPassed),
      selected: false,
      rows: resultRows,
    }
  }).sort((a, b) => {
    if (a.status === 'Failed') return 1
    if (b.status === 'Failed') return -1
    return a.sampleId.localeCompare(b.sampleId)
  })
}

function buildSummaries(
  records: RawMolecularRow[],
  plateId: string,
  device: string,
  runDate: string,
  plateSize: PlateSize = 96,
  plateQc: PlateQcEvaluation = evaluatePlateQc(records),
  instrumentControls: InstrumentControlConfig[] = [],
): { plateSummary: PlateSummary; validationSummary: ValidationSummary; qcBanner: QcBanner } {
  const sampleRecords = records.filter((r) => !isControlRecord(r))
  const controlRecords = records.filter((r) => isControlRecord(r))
  const samples = new Set(sampleRecords.map((r) => r.sampleId))
  const controls = new Set(controlRecords.map((r) => r.qcType || r.sampleId))
  const isSampleError = (sampleId: string) => {
    if (isUnknownSample(sampleId)) return true
    const row = sampleRecords.find((r) => r.sampleId === sampleId)
    if (row && hasFileContext(row)) return false
    return !lookupSample(sampleId)
  }
  const unknowns = [...samples].filter(isSampleError)
  const validSamples = [...samples].filter((s) => !isSampleError(s))

  const wellToSample = new Map<string, string>()
  let duplicateWells = 0
  for (const r of sampleRecords) {
    const existing = wellToSample.get(r.well)
    if (existing && existing !== r.sampleId) duplicateWells++
    else wellToSample.set(r.well, r.sampleId)
  }

  const errors = unknowns.length
  const missingControls = instrumentControls.length > 0
    ? instrumentControls.filter((config) => findWellsForConfig(records, config).length === 0).length
    : [plateQc.pc, plateQc.nc].filter((t) => !t.present).length

  return {
    plateSummary: {
      plateId,
      device,
      runDate,
      totalWells: plateSize,
      mappedSamples: samples.size,
      controls: controls.size,
      errors,
    },
    validationSummary: {
      validSamples: validSamples.length,
      unknownSampleIds: unknowns.filter((s) => isUnknownSample(s)).length || unknowns.length,
      duplicateWells,
      missingControls,
    },
    qcBanner: {
      pcPassed: plateQc.pc.passed,
      ncPassed: plateQc.nc.passed,
      ntcPassed: plateQc.ntc.present ? plateQc.ntc.passed : true,
      icPassed: plateQc.ic.present ? plateQc.ic.passed : true,
      pcPresent: plateQc.pc.present,
      ncPresent: plateQc.nc.present,
      ntcPresent: plateQc.ntc.present,
      icPresent: plateQc.ic.present,
      qcPassed: plateQc.qcPassed,
      failedControlWells: plateQc.failedControlWells,
      status: plateQc.status,
    },
  }
}

export function buildValidationData(input: BuildInput): ParsedUploadData {
  const {
    records,
    fileName,
    rawText,
    fieldMappings,
    device,
    plateId,
    runDate,
    defaultPanel,
    plateSize = 96,
    instrumentControls = [],
    plateViewReadiness,
  } = input

  const wellSampleDup = new Map<string, Set<string>>()
  for (const r of records) {
    const set = wellSampleDup.get(r.well) ?? new Set()
    set.add(r.sampleId)
    wellSampleDup.set(r.well, set)
  }

  const previewRows: PreviewRow[] = records.map((r, i) => ({
    id: String(i + 1),
    sampleId: r.sampleId,
    patient: r.patient,
    testOrder: r.testOrder,
    panel: r.panel,
    isQc: r.isQc,
    qcType: r.qcType,
    wellPosition: r.well,
    targetName: r.target,
    ctValue: r.ct,
    viralLoad: r.viralLoad ?? '',
    interpretation: r.interpretation,
    interpretationValue: r.interpretationValue,
    ampStatus: r.ampStatus,
    type: isControlRecord(r) ? 'Control' : r.type,
    validationStatus: rowValidationStatus(r, (wellSampleDup.get(r.well)?.size ?? 0) > 1),
    selected: rowValidationStatus(r, false) === 'Valid',
  }))

  const plateQc = instrumentControls.length > 0
    ? evaluatePlateQcFromConfig(records, instrumentControls, AVAILABLE_TARGETS)
    : evaluatePlateQc(records)
  const { plateSummary, validationSummary, qcBanner } = buildSummaries(
    records,
    plateId,
    device,
    runDate,
    plateSize,
    plateQc,
    instrumentControls,
  )
  const failedControlWellIds = new Set(qcBanner.failedControlWells.map((f) => f.wellId))
  const affectedTargets = computeAffectedTargetsFromFailedTargetedControls(
    records,
    qcBanner.failedControlWells,
    instrumentControls,
    AVAILABLE_TARGETS,
  )
  const sampleGroups = buildSampleGroups(records, plateId, defaultPanel, qcBanner.qcPassed, affectedTargets)
  const plateWells = buildPlateWellsFromRecords(
    records,
    plateId,
    defaultPanel,
    runDate,
    failedControlWellIds,
    plateQc,
    instrumentControls,
  ).map((well) => {
    const affected = wellTestsAffectedTarget(well, affectedTargets)
    let qcStatus = well.qcStatus

    if (isPlateControlWell(well)) {
      qcStatus = well.controlFailed ? 'QC Failed' : 'QC Passed'
    } else if (affected) {
      qcStatus = 'QC Failed'
    } else if (well.qcStatus === 'QC Failed') {
      qcStatus = 'QC Passed'
    }

    return {
      ...well,
      affectedByTargetedControlFailure: affected,
      qcStatus,
    }
  })

  const readyCount = sampleGroups.filter((g) => g.status === 'Ready for Release').length
  const reviewCount = sampleGroups.filter((g) => g.status === 'Needs Review').length

  const activityLog: ActivityLogEntry[] = [
    { time: nowTime(), message: `File uploaded: ${fileName}` },
    { time: nowTime(), message: 'Plate map generated from uploaded file' },
    { time: nowTime(), message: qcBanner.qcPassed ? 'Plate QC passed' : 'Plate QC failed or incomplete' },
    ...(qcBanner.failedControlWells.length > 0
      ? [{ time: nowTime(), message: `Failed control wells: ${qcBanner.failedControlWells.map((f) => `${f.wellId} (${f.label})`).join(', ')}` }]
      : []),
    { time: nowTime(), message: `${readyCount} samples ready for release` },
  ]
  if (reviewCount > 0) activityLog.push({ time: nowTime(), message: `${reviewCount} samples need review` })
  if (validationSummary.unknownSampleIds > 0) {
    activityLog.push({ time: nowTime(), message: `${validationSummary.unknownSampleIds} unknown sample IDs flagged` })
  }

  return {
    fileName,
    rawText,
    fieldMappings,
    previewRows,
    plateSummary,
    validationSummary,
    sampleGroups,
    plateWells,
    activityLog,
    qcBanner,
    plateViewReadiness,
  }
}
