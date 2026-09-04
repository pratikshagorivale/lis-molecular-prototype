export type PlateSize = 96 | 384 | 1536

export const PLATE_SIZE_OPTIONS: { value: PlateSize; label: string }[] = [
  { value: 96, label: '96-Well Plate' },
  { value: 384, label: '384-Well Plate' },
  { value: 1536, label: '1536-Well Plate' },
]

export type ValidationStatus = 'Valid' | 'Error' | 'Warning'
export type WellQcStatus = 'QC Passed' | 'QC Warning' | 'QC Failed'
export type SampleStatus = 'Ready' | 'Ready for Release' | 'Failed' | 'Needs Review'
export type WellStatus = 'ready' | 'review' | 'failed' | 'control' | 'empty'
export type Interpretation = 'Detected' | 'Not Detected' | 'Passed' | 'Inconclusive'
export type TargetType = 'Organism' | 'Gene' | 'Control'

export interface PreviewRow {
  id: string
  sampleId: string
  patient: string
  testOrder: string
  panel: string
  isQc: boolean
  qcType: string
  wellPosition: string
  targetName: string
  ctValue: number | string
  viralLoad: string
  interpretation: Interpretation
  interpretationValue?: string
  ampStatus?: string
  type: TargetType
  validationStatus: ValidationStatus
  selected: boolean
}

export interface ResultRow {
  well: string
  plateId: string
  targetName: string
  ctValue: number | string
  interpretation: Interpretation
  interpretationValue?: string
  ampStatus?: string
  type: TargetType
  resistantAntibiotics: string
  sensitiveAntibiotics: string
  status: SampleStatus
  controlPassed: boolean
}

export interface SampleGroup {
  sampleId: string
  patient: string
  testOrder: string
  panel: string
  status: SampleStatus
  error?: string
  detectedOrganisms: number
  resistanceGenes: number
  controlsPassed: boolean
  sampleValid: boolean
  rows: ResultRow[]
  selected: boolean
}

export interface WellTargetRow {
  target: string
  result: number | string
  interpretation: Interpretation
  status: ValidationStatus
  additionalMetrics?: WellAdditionalMetrics
}

export interface WellControlValidation {
  control: string
  position: string
  status: 'Pass' | 'Fail'
}

export interface WellAdditionalMetrics {
  ampStatus?: string
  ampScore?: string
  cqConfidence?: string
  reporterDye?: string
  thresholdValue?: string
}

export interface WellData {
  wellId: string
  plateId: string
  runDate: string
  sampleId: string
  accessionNumber: string
  patient: string
  testOrder: string
  panel: string
  isQc: boolean
  qcType: string
  status: WellStatus
  label: string
  qcStatus: WellQcStatus
  totalTargetCount?: number
  detectedCount?: number
  notDetectedCount?: number
  detectedTargets: string[]
  notDetectedTargets: string[]
  targetRows: WellTargetRow[]
  controlValidations: WellControlValidation[]
  ctValues: { target: string; ct: number | string; interpretation: Interpretation; ampStatus?: string }[]
  validationChecks: { label: string; passed: boolean }[]
  validationErrors?: string[]
  isFailed: boolean
  controlFailed?: boolean
  controlsPassed?: boolean
  affectedByTargetedControlFailure?: boolean
}

export interface FailedControlWell {
  wellId: string
  controlType: string
  sampleId: string
  label: string
}

export interface InstrumentCard {
  id: string
  name: string
  category: string
  borderColor: string
  qcLastSync: string
  paramsLastSync: string
  lastUploadedPlate?: string
  pendingValidation?: number
  qcCount?: number
  paramsCount?: number
  isMolecular?: boolean
}

export interface FieldMapping {
  source: string
  target: string
  status: 'Mapped' | 'Unmapped'
}

export type MappingTargetKey =
  | 'well'
  | 'sampleId'
  | 'target'
  | 'result'
  | 'interpretation'
  | 'ampStatus'
  | 'viralLoad'
  | 'plateId'
  | 'thresholdValue'
  | 'reporterDye'
  | 'cqConfidence'

export interface MappedTargetMetrics {
  thresholdValue: boolean
  reporterDye: boolean
  cqConfidence: boolean
}

export interface UserFieldMapping {
  key: MappingTargetKey
  label: string
  sourceColumn: string
  required: boolean
}

export interface FileParseContext {
  fileName: string
  rawRows: unknown[][]
  /** 0-based index of the header row in rawRows */
  headerRowIndex: number
  /** 0-based index of the first data row in rawRows */
  dataStartRowIndex: number
  sourceColumns: string[]
  rawText: string
  metadata: {
    device: string
    plateId: string
    runDate: string
    defaultPanel: string
  }
}

export interface PlateSummary {
  plateId: string
  device: string
  runDate: string
  totalWells: number
  mappedSamples: number
  controls: number
  errors: number
}

export interface ValidationSummary {
  validSamples: number
  unknownSampleIds: number
  duplicateWells: number
  missingControls: number
}

/** Where a plate sits in its lifecycle — drives the All Plates status filter. */
export type PlateLifecycleStatus =
  | 'Pending'
  | 'Partially Released'
  | 'Released'
  | 'Rejected'

export type PlateQcOutcome = 'Passed' | 'Warning' | 'Failed'

export type PlateAuditAction =
  | 'uploaded'
  | 'qc-evaluated'
  | 'validated'
  | 'released'
  | 'partially-released'
  | 'rejected'
  | 'capa-raised'
  | 'capa-updated'
  | 'capa-closed'

/** One immutable entry in a plate's audit trail. */
export interface PlateAuditEvent {
  id: string
  action: PlateAuditAction
  actor: string
  actorRole: string
  /** ISO 8601 timestamp — formatted for display at render time. */
  timestamp: string
  summary: string
  detail?: string
  /** Sample IDs the event applied to, when it was scoped to a subset of the plate. */
  sampleIds?: string[]
}

export type CapaStatus = 'Open' | 'In Progress' | 'Closed'

/** Corrective and Preventive Action raised against a QC failure. Always optional. */
export interface CapaRecord {
  id: string
  plateId: string
  raisedBy: string
  raisedAt: string
  qcFailureSummary: string
  rootCause: string
  correctiveAction: string
  preventiveAction: string
  status: CapaStatus
  closedBy?: string
  closedAt?: string
}

/** Sample-level index entry so a plate can be traced back from a Sample ID. */
export interface PlateSampleRef {
  sampleId: string
  accessionNumber: string
  patient: string
  wellId: string
  status: SampleStatus
}

/** One plate in the tracking registry — every plate, not only pending ones. */
export interface PlateRecord {
  plateId: string
  runDate: string
  instrument: string
  samplesProcessed: number
  samplesValid: number
  samplesInvalid: number
  status: PlateLifecycleStatus
  qcOutcome: PlateQcOutcome
  qcFailureSummary?: string
  uploadedBy: string
  uploadedAt: string
  releasedBy?: string
  releasedAt?: string
  rejectedBy?: string
  rejectedAt?: string
  samples: PlateSampleRef[]
  auditTrail: PlateAuditEvent[]
  capa: CapaRecord[]
}

/** Draft captured by the CAPA form before it becomes a CapaRecord. */
export interface CapaFormData {
  rootCause: string
  correctiveAction: string
  preventiveAction: string
  status: CapaStatus
}

export interface ActivityLogEntry {
  time: string
  message: string
}

export interface QcBanner {
  pcPassed: boolean
  ncPassed: boolean
  ntcPassed: boolean
  icPassed: boolean
  pcPresent: boolean
  ncPresent: boolean
  ntcPresent: boolean
  icPresent: boolean
  qcPassed: boolean
  failedControlWells: FailedControlWell[]
  status: string
}

export interface PlateViewReadiness {
  canFormPlate: boolean
  wellColumnMapped: boolean
  plateIdAvailable: boolean
  message?: string
}

export interface ParsedUploadData {
  fileName: string
  rawText: string
  fieldMappings: FieldMapping[]
  previewRows: PreviewRow[]
  plateSummary: PlateSummary
  validationSummary: ValidationSummary
  sampleGroups: SampleGroup[]
  plateWells: WellData[]
  activityLog: ActivityLogEntry[]
  qcBanner: QcBanner
  plateViewReadiness: PlateViewReadiness
  mappedTargetMetrics: MappedTargetMetrics
  /** Original parsed rows — used to rebuild validation after well selection. */
  sourceRecords: import('../utils/parseMolecularFile').RawMolecularRow[]
  defaultPanel: string
  plateSize: PlateSize
}

export type Screen = 'home' | 'validation'

export type QcView = 'list' | 'detail'

export type AppNav = 'home' | 'device-validation' | 'waiting' | 'critical' | 'archives' | 'inventory' | 'tat' | 'qc'

export type InstrumentConnectionStatus = 'Connected' | 'Disconnected'

export type InstrumentDetailTab = 'tests' | 'organism' | 'genes' | 'unmapped-keys' | 'reagent' | 'controls'

export type ControlTypeOption =
  | 'Positive Control'
  | 'Negative Control'
  | 'NTC'
  | 'Internal Control'
  | 'Extraction Control'

export type ControlScope = 'plate' | 'targeted'

export type AmpStatusOption = 'Detected' | 'Not Detected' | 'Inconclusive'

export type PlateFailureBehavior = 'fail-plate' | 'warning-only'

export type TargetedFailureBehavior = 'fail-plate' | 'fail-target' | 'warning-only'

export type TargetedControlTargetType = 'Gene' | 'Organism'

export interface TargetedControlTarget {
  id: string
  target: string
  type: TargetedControlTargetType
  ctCutOff: string
  status: AmpStatusOption
}

export interface InstrumentControlConfig {
  id: string
  controlType: ControlTypeOption
  control: string
  scope: ControlScope
  expectedResultCtCutOff?: string
  status?: AmpStatusOption
  targets?: TargetedControlTarget[]
  plateFailureBehavior?: PlateFailureBehavior
  targetedFailureBehavior?: TargetedFailureBehavior
}

export interface ManagedInstrument {
  id: string
  name: string
  instrumentType: string
  connectionStatus: InstrumentConnectionStatus
  authKey: string
  enabled: boolean
  isMolecular?: boolean
  controls: InstrumentControlConfig[]
}

export interface AddControlFormData {
  controlType: ControlTypeOption
  control: string
  scope: ControlScope
  expectedResultCtCutOff: string
  status: AmpStatusOption
  targets: TargetedControlTarget[]
  plateFailureBehavior: PlateFailureBehavior
  targetedFailureBehavior: TargetedFailureBehavior
}

export type WaitingListCategoryId =
  | 'all'
  | 'incomplete'
  | 'partially-completed'
  | 'active-reruns'
  | 'completed'
  | 'partially-validated'
  | 'preliminary'
  | 'stat'
  | 'critical'
  | 'tat-exceeded'
  | 'sendout'
  | 'auto-approval'

export interface PendingTestCategory {
  id: WaitingListCategoryId
  label: string
  count: number
}

export interface WaitingListTag {
  label: string
  variant: 'insurance' | 'paid' | 'trends'
}

export interface WaitingListEntry {
  id: string
  accessionNo: string
  sampleId: string
  service: string
  patientName: string
  patientMeta: string
  account: string
  provider: string
  status: string
  lastUpdated: string
  dateGroup: string
  tags: WaitingListTag[]
  previewCount: number
}

export interface ReportResultRow {
  id: string
  name: string
  cutOff: string
  result: string
  interpretation: string
  viralLoad?: string
  antibioticName?: string
}

export interface MolecularReportData {
  reportTitle: string
  status: string
  sampleId: string
  patientName: string
  patientMeta: string
  patientRef: string
  accessionDate: string
  billDate: string
  billedBy: string
  billId: string
  orderNo: string
  organization: string
  referralName: string
  genes: ReportResultRow[]
  organisms: ReportResultRow[]
  antibioticResistance: ReportResultRow[]
}
