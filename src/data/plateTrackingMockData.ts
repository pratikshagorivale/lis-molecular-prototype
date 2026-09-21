import { buildPlateWells } from './mockData'
import { auditResultsFromControls, controlsFromBanner } from '../utils/qcFailures'
import type {
  AuditQcResult,
  CapaRecord,
  ParsedUploadData,
  PlateAuditEvent,
  PlateQcControl,
  PlateRecord,
  PlateSampleRef,
  SampleStatus,
} from '../types'

/** Signed-in operator — every audit event this session is attributed to them. */
export const CURRENT_USER = {
  name: 'Pratiksha Gorivale',
  role: 'Lab Technologist',
  id: '#6284',
}

const PATIENTS = [
  'Rohan Deshpande', 'Aisha Khan', 'Meera Iyer', 'Karan Malhotra', 'Sneha Rao',
  'Vikram Nair', 'Priya Menon', 'Arjun Bhat', 'Fatima Sheikh', 'Nikhil Joshi',
  'Divya Pillai', 'Sameer Kulkarni',
]

let auditSeq = 0
function auditId(): string {
  auditSeq += 1
  return `evt-${auditSeq.toString().padStart(4, '0')}`
}

/**
 * Deterministic sample list so a Sample ID always traces back to the same plate.
 * Samples fill rows A-G; row H is left for the PC/NC/NTC control wells.
 */
const MAX_SAMPLES_PER_PLATE = 84

function buildSamples(seed: number, count: number, invalidCount: number): PlateSampleRef[] {
  const total = Math.min(count, MAX_SAMPLES_PER_PLATE)
  const rows = Math.ceil(total / 12)
  return Array.from({ length: total }, (_, i) => {
    const isInvalid = i >= total - invalidCount
    const status: SampleStatus = isInvalid
      ? (i % 2 === 0 ? 'Failed' : 'Needs Review')
      : 'Ready for Release'
    const row = String.fromCharCode(65 + Math.min(Math.floor(i / 12), rows - 1))
    return {
      sampleId: String(seed + i).padStart(9, '0'),
      accessionNumber: `ACC-${String(seed + i).slice(-6)}`,
      patient: PATIENTS[(seed + i) % PATIENTS.length],
      wellId: `${row}${(i % 12) + 1}`,
      status,
    }
  })
}

function event(
  action: PlateAuditEvent['action'],
  actor: string,
  actorRole: string,
  timestamp: string,
  summary: string,
  extras?: { qcResults?: AuditQcResult[]; sampleIds?: string[] },
): PlateAuditEvent {
  return {
    id: auditId(),
    action,
    actor,
    actorRole,
    timestamp,
    summary,
    qcResults: extras?.qcResults,
    sampleIds: extras?.sampleIds,
  }
}

/** QC is always evaluated by the system, never a person. Derived from the plate's controls. */
function qcEvent(timestamp: string, controls: PlateQcControl[]): PlateAuditEvent {
  const results = auditResultsFromControls(controls)
  const failed = results.filter((r) => !r.passed)
  return event(
    'qc-result',
    'System',
    'Automated QC',
    timestamp,
    failed.length === 0
      ? `QC passed — ${results.length} control${results.length === 1 ? '' : 's'} within limits`
      : `QC failed — ${failed.length} of ${results.length} control${results.length === 1 ? '' : 's'} out of limits`,
    { qcResults: results },
  )
}

const CAPA_PLATE7: CapaRecord = {
  id: 'CAPA-2026-014',
  plateId: 'PLATE 7',
  control: 'NTC',
  controlLabel: 'NTC (H12)',
  raisedBy: 'Anjali Verma',
  raisedAt: '2026-08-05T14:20:00',
  qcFailureSummary: 'NTC amplification detected in well H12 (Ct 32.4) — possible carryover contamination.',
  rootCause: 'Aerosol carryover during master-mix aliquoting; barrier tips were not used for the NTC well.',
  correctiveAction:
    'Plate 7 NTC column re-run with fresh master mix. Affected 6 samples re-extracted and re-amplified on Plate 8.',
  preventiveAction:
    'Filter-barrier tips made mandatory for all NTC and PC setup. Bench decontamination logged before every molecular run.',
  status: 'Closed',
  closedBy: 'Dr. S. Raghavan',
  closedAt: '2026-08-07T09:05:00',
}

const CAPA_MU1: CapaRecord = {
  id: 'CAPA-2026-015',
  plateId: 'MU1',
  control: 'IC',
  controlLabel: 'Internal Control',
  raisedBy: 'Pratiksha Gorivale',
  raisedAt: '2026-08-04T17:45:00',
  qcFailureSummary: 'Internal Control below cut-off in the flagged sample wells — suspected inhibition.',
  rootCause: 'Under investigation — extraction batch EXT-2208 suspected.',
  correctiveAction: 'Four affected samples held from release pending re-extraction.',
  preventiveAction: '',
  status: 'In Progress',
}

/**
 * AB1P keeps the hand-authored demo grid, so its registry samples are read back
 * out of those wells rather than generated — the two stay in step.
 */
function samplesFromDemoWells(): PlateSampleRef[] {
  const seen = new Set<string>()
  return buildPlateWells()
    .filter((well) => well.status !== 'empty' && !well.isQc && well.sampleId)
    .filter((well) => {
      if (seen.has(well.sampleId)) return false
      seen.add(well.sampleId)
      return true
    })
    .map((well) => ({
      sampleId: well.sampleId,
      accessionNumber: well.accessionNumber || well.testOrder || '—',
      patient: well.patient || 'Not Found',
      wellId: well.wellId,
      status: well.status === 'failed'
        ? 'Failed'
        : well.status === 'review' ? 'Needs Review' : 'Ready for Release',
    }))
}

const AB1P_SAMPLES = samplesFromDemoWells()

/** Each plate's controls, declared once and used for the banner, Summary tab and audit entry. */
const PLATE9_CONTROLS: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: false, detail: 'Undetermined — no amplification', summary: 'Positive Control did not amplify — no Ct value returned.' },
  { control: 'NC', wells: ['H11'], passed: true, detail: 'Not Detected as expected' },
  { control: 'NTC', wells: ['H12'], passed: false, detail: 'Amplified at Ct 30.8 — expected Not Detected', summary: 'NTC amplified at Ct 30.8 — expected Not Detected.' },
]

const PLATE8_CONTROLS: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: true, detail: 'Ct 22.8 — cut-off ≤ 30' },
  { control: 'NC', wells: ['H11'], passed: true, detail: 'Not Detected as expected' },
  { control: 'NTC', wells: ['H12'], passed: true, detail: 'Not Detected as expected' },
]

const PLATE7_CONTROLS: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: true, detail: 'Ct 24.1 — cut-off ≤ 30' },
  { control: 'NC', wells: ['H11'], passed: true, detail: 'Not Detected as expected' },
  { control: 'NTC', wells: ['H12'], passed: false, detail: 'Amplified at Ct 32.4 — expected Not Detected', summary: 'NTC amplified at Ct 32.4 — expected Not Detected.' },
  { control: 'IC', wells: [], passed: true, detail: 'Within limits in all sample wells' },
]

const MU1_CONTROLS: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: true, detail: 'Ct 23.6 — cut-off ≤ 30' },
  { control: 'NC', wells: ['H11'], passed: true, detail: 'Not Detected as expected' },
  { control: 'NTC', wells: ['H12'], passed: true, detail: 'Not Detected as expected' },
  { control: 'IC', wells: [], passed: false, detail: 'Ct > 34 in the flagged sample wells', summary: 'Internal Control below cut-off in the flagged sample wells — suspected inhibition.' },
]

const AB1P_CONTROLS: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: true, detail: 'Ct 21.9 — cut-off ≤ 30' },
  { control: 'NC', wells: ['H11'], passed: true, detail: 'Not Detected as expected' },
  { control: 'NTC', wells: ['H12'], passed: true, detail: 'Not Detected as expected' },
]

const QS502_CONTROLS: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: true, detail: 'Ct 22.4 — cut-off ≤ 30' },
  { control: 'NC', wells: ['H11'], passed: true, detail: 'Not Detected as expected' },
  { control: 'NTC', wells: ['H12'], passed: true, detail: 'Not Detected as expected' },
  { control: 'IC', wells: [], passed: true, detail: 'Within limits in all sample wells' },
]

const QS501_CONTROLS: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: false, detail: 'Undetermined — no amplification', summary: 'Positive Control failed to amplify — no Ct value returned.' },
  { control: 'NC', wells: ['H11'], passed: true, detail: 'Not Detected as expected' },
  { control: 'NTC', wells: ['H12'], passed: true, detail: 'Not Detected as expected' },
]

export const PLATE_REGISTRY_MOCK: PlateRecord[] = [
  {
    plateId: 'PLATE 9',
    runDate: '7 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 44,
    samplesValid: 0,
    samplesInvalid: 44,
    status: 'Pending',
    qcOutcome: 'Failed',
    qcControls: PLATE9_CONTROLS,
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-07T08:15:00',
    samples: buildSamples(727500, 44, 44),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-07T08:15:00',
        'Plate uploaded from QuantStudio_Plate9_070826.xlsx'),
      qcEvent('2026-08-07T08:15:04', PLATE9_CONTROLS),
    ],
    capa: [],
  },
  {
    plateId: 'PLATE 8',
    runDate: '6 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 48,
    samplesValid: 42,
    samplesInvalid: 6,
    status: 'Pending',
    qcOutcome: 'Passed',
    qcControls: PLATE8_CONTROLS,
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-06T09:12:00',
    samples: buildSamples(727600, 48, 6),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-06T09:12:00',
        'Plate uploaded from QuantStudio_Plate8_060826.xlsx'),
      qcEvent('2026-08-06T09:12:04', PLATE8_CONTROLS),
    ],
    capa: [],
  },
  {
    plateId: 'PLATE 7',
    runDate: '5 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 84,
    samplesValid: 78,
    samplesInvalid: 6,
    status: 'Partially Released',
    qcOutcome: 'Failed',
    qcControls: PLATE7_CONTROLS,
    uploadedBy: 'Anjali Verma',
    uploadedAt: '2026-08-05T08:40:00',
    releasedBy: 'Dr. S. Raghavan',
    releasedAt: '2026-08-05T16:10:00',
    samples: buildSamples(727300, 84, 6),
    auditTrail: [
      event('uploaded', 'Anjali Verma', 'Lab Technologist', '2026-08-05T08:40:00',
        'Plate uploaded from QuantStudio_Plate7_050826.xlsx'),
      qcEvent('2026-08-05T08:40:06', PLATE7_CONTROLS),
      event('capa-added', 'Anjali Verma', 'Lab Technologist', '2026-08-05T14:20:00',
        'CAPA-2026-014 added against NTC failure'),
      event('released', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-05T16:10:00',
        'Released 78 of 84 samples to LIS reports',
        { sampleIds: buildSamples(727300, 84, 6).slice(78).map((sample) => sample.sampleId) }),
    ],
    capa: [CAPA_PLATE7],
  },
  {
    plateId: 'MU1',
    runDate: '4 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 72,
    samplesValid: 68,
    samplesInvalid: 4,
    status: 'Pending',
    qcOutcome: 'Failed',
    qcControls: MU1_CONTROLS,
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-04T11:05:00',
    samples: buildSamples(727200, 72, 4),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-04T11:05:00',
        'Plate uploaded from MU1_040826.csv'),
      qcEvent('2026-08-04T11:05:03', MU1_CONTROLS),
      event('capa-added', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-04T17:45:00',
        'CAPA-2026-015 added against Internal Control failure'),
    ],
    capa: [CAPA_MU1],
  },
  {
    plateId: 'AB1P',
    runDate: '3 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: AB1P_SAMPLES.length,
    samplesValid: AB1P_SAMPLES.filter((s) => s.status === 'Ready for Release').length,
    samplesInvalid: AB1P_SAMPLES.filter((s) => s.status !== 'Ready for Release').length,
    status: 'Pending',
    qcOutcome: 'Passed',
    qcControls: AB1P_CONTROLS,
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-03T10:22:00',
    samples: AB1P_SAMPLES,
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-03T10:22:00',
        'Plate uploaded from AB1P_030826.xlsx'),
      qcEvent('2026-08-03T10:22:05', AB1P_CONTROLS),
    ],
    capa: [],
  },
  {
    plateId: 'QS5-02',
    runDate: '2 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 36,
    samplesValid: 36,
    samplesInvalid: 0,
    status: 'Released',
    qcOutcome: 'Passed',
    qcControls: QS502_CONTROLS,
    uploadedBy: 'Anjali Verma',
    uploadedAt: '2026-08-02T09:00:00',
    releasedBy: 'Dr. S. Raghavan',
    releasedAt: '2026-08-02T13:30:00',
    samples: buildSamples(727000, 36, 0),
    auditTrail: [
      event('uploaded', 'Anjali Verma', 'Lab Technologist', '2026-08-02T09:00:00',
        'Plate uploaded from QS5-02_020826.xlsx'),
      qcEvent('2026-08-02T09:00:04', QS502_CONTROLS),
      event('released', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-02T13:30:00',
        'Released all 36 samples to LIS reports'),
    ],
    capa: [],
  },
  {
    plateId: 'QS5-01',
    runDate: '1 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 24,
    samplesValid: 0,
    samplesInvalid: 24,
    status: 'Rejected',
    qcOutcome: 'Failed',
    qcControls: QS501_CONTROLS,
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-01T15:18:00',
    rejectedBy: 'Dr. S. Raghavan',
    rejectedAt: '2026-08-01T16:02:00',
    samples: buildSamples(726900, 24, 24),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-01T15:18:00',
        'Plate uploaded from QS5-01_010826.xlsx'),
      qcEvent('2026-08-01T15:18:02', QS501_CONTROLS),
      event('rejected', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-01T16:02:00',
        'Plate rejected — Positive Control failure invalidates all 24 samples; full re-run scheduled for 2 Aug'),
      event('capa-added', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-01T16:30:00',
        'CAPA-2026-013 added against Positive Control failure'),
    ],
    capa: [
      {
        id: 'CAPA-2026-013',
        plateId: 'QS5-01',
        control: 'PC',
        controlLabel: 'Positive Control (H10)',
        raisedBy: 'Pratiksha Gorivale',
        raisedAt: '2026-08-01T16:30:00',
        qcFailureSummary: 'Positive Control failed to amplify — no Ct value returned.',
        rootCause: 'Master-mix lot MM-4471 stored above 8 °C for approximately 6 hours after delivery.',
        correctiveAction: 'Lot MM-4471 quarantined. Plate re-run on 2 Aug with lot MM-4482 — QC passed.',
        preventiveAction:
          'Cold-chain temperature logger added to every reagent delivery; receipt checklist updated.',
        status: 'Open',
      },
    ],
  },
]

/** Merge the plate currently open in validation into the registry, keeping its live counts. */
export function mergeUploadIntoRegistry(
  registry: PlateRecord[],
  uploadData?: ParsedUploadData | null,
): PlateRecord[] {
  if (!uploadData) return registry

  const plateId = uploadData.plateSummary.plateId?.trim()
  if (!plateId) return registry

  const valid = uploadData.sampleGroups.filter((g) => g.sampleValid).length
  const processed = uploadData.sampleGroups.length
  const invalid = Math.max(0, processed - valid)
  const qcOutcome = uploadData.qcBanner.qcPassed ? 'Passed' as const : 'Failed' as const

  const uploadedAt = new Date().toISOString()

  const existing = registry.find((p) => p.plateId.toUpperCase() === plateId.toUpperCase())
  const rest = registry.filter((p) => p.plateId.toUpperCase() !== plateId.toUpperCase())

  // Re-derive from the live banner, but keep the wording already recorded for a control.
  const qcControls = controlsFromBanner(uploadData.qcBanner).map((derived) => {
    const recorded = existing?.qcControls.find((c) => c.control === derived.control)
    return recorded && recorded.passed === derived.passed ? recorded : derived
  })

  const samples: PlateSampleRef[] = uploadData.sampleGroups.map((group) => ({
    sampleId: group.sampleId,
    accessionNumber: group.testOrder,
    patient: group.patient,
    wellId: group.rows[0]?.well ?? '—',
    status: group.status,
  }))

  const current: PlateRecord = existing
    ? {
        ...existing,
        samplesProcessed: processed,
        samplesValid: valid,
        samplesInvalid: invalid,
        qcOutcome,
        qcControls,
        samples,
      }
    : {
        plateId,
        runDate: uploadData.plateSummary.runDate,
        instrument: uploadData.plateSummary.device || 'Molecular Instrument',
        samplesProcessed: processed,
        samplesValid: valid,
        samplesInvalid: invalid,
        status: 'Pending',
        qcOutcome,
        qcControls,
        uploadedBy: CURRENT_USER.name,
        uploadedAt,
        samples,
        auditTrail: [
          {
            id: `evt-live-${plateId}-upload`,
            action: 'uploaded',
            actor: CURRENT_USER.name,
            actorRole: CURRENT_USER.role,
            timestamp: uploadedAt,
            summary: `Plate uploaded from ${uploadData.fileName}`,
          },
          {
            id: `evt-live-${plateId}-qc`,
            action: 'qc-result',
            actor: 'System',
            actorRole: 'Automated QC',
            timestamp: uploadedAt,
            summary: qcControls.every((c) => c.passed)
              ? `QC passed — ${qcControls.length} control${qcControls.length === 1 ? '' : 's'} within limits`
              : `QC failed — ${qcControls.filter((c) => !c.passed).length} of ${qcControls.length} controls out of limits`,
            qcResults: auditResultsFromControls(qcControls),
          },
        ],
        capa: [],
      }

  return [current, ...rest]
}
