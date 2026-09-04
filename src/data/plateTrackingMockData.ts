import type {
  CapaRecord,
  ParsedUploadData,
  PlateAuditEvent,
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

/** Deterministic sample list so a Sample ID always traces back to the same plate. */
function buildSamples(seed: number, count: number, invalidCount: number): PlateSampleRef[] {
  const rows = Math.ceil(count / 12)
  return Array.from({ length: count }, (_, i) => {
    const isInvalid = i >= count - invalidCount
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
  detail?: string,
  sampleIds?: string[],
): PlateAuditEvent {
  return { id: auditId(), action, actor, actorRole, timestamp, summary, detail, sampleIds }
}

const CAPA_PLATE7: CapaRecord = {
  id: 'CAPA-2026-014',
  plateId: 'PLATE 7',
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
  raisedBy: 'Pratiksha Gorivale',
  raisedAt: '2026-08-04T17:45:00',
  qcFailureSummary: 'Internal Control below cut-off in 4 wells (C3, C7, D1, D9) — suspected inhibition.',
  rootCause: 'Under investigation — extraction batch EXT-2208 suspected.',
  correctiveAction: 'Four affected samples held from release pending re-extraction.',
  preventiveAction: '',
  status: 'In Progress',
}

export const PLATE_REGISTRY_MOCK: PlateRecord[] = [
  {
    plateId: 'PLATE 8',
    runDate: '6 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 48,
    samplesValid: 42,
    samplesInvalid: 6,
    status: 'Pending',
    qcOutcome: 'Passed',
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-06T09:12:00',
    samples: buildSamples(727400, 48, 6),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-06T09:12:00',
        'Plate uploaded from QuantStudio_Plate8_060826.xlsx',
        '48 wells parsed, 44 samples mapped to LIS orders, 4 controls detected.'),
      event('qc-evaluated', 'System', 'Automated QC', '2026-08-06T09:12:04',
        'QC passed — PC, NC and NTC within configured limits',
        'PC Ct 22.8 (cut-off ≤ 30), NC not detected, NTC not detected.'),
    ],
    capa: [],
  },
  {
    plateId: 'PLATE 7',
    runDate: '5 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 96,
    samplesValid: 90,
    samplesInvalid: 6,
    status: 'Partially Released',
    qcOutcome: 'Failed',
    qcFailureSummary: 'NTC amplification detected in well H12 (Ct 32.4).',
    uploadedBy: 'Anjali Verma',
    uploadedAt: '2026-08-05T08:40:00',
    releasedBy: 'Dr. S. Raghavan',
    releasedAt: '2026-08-05T16:10:00',
    samples: buildSamples(727300, 96, 6),
    auditTrail: [
      event('uploaded', 'Anjali Verma', 'Lab Technologist', '2026-08-05T08:40:00',
        'Plate uploaded from QuantStudio_Plate7_050826.xlsx',
        '96 wells parsed, 90 samples mapped to LIS orders, 6 controls detected.'),
      event('qc-evaluated', 'System', 'Automated QC', '2026-08-05T08:40:06',
        'QC failed — NTC amplification detected',
        'NTC well H12 amplified at Ct 32.4; expected Not Detected. Plate flagged for review.'),
      event('capa-raised', 'Anjali Verma', 'Lab Technologist', '2026-08-05T14:20:00',
        'CAPA-2026-014 raised against NTC failure',
        'Root cause recorded as aerosol carryover during master-mix aliquoting.'),
      event('validated', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-05T15:52:00',
        'Validated 90 of 96 samples',
        '6 samples in the H12 quadrant withheld pending re-extraction.'),
      event('partially-released', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-05T16:10:00',
        'Released 90 valid samples to LIS reports',
        '6 samples excluded — carried to Plate 8 for re-run.',
        buildSamples(727300, 96, 6).slice(90).map((s) => s.sampleId)),
      event('capa-closed', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-07T09:05:00',
        'CAPA-2026-014 closed',
        'Preventive action verified — barrier tips in use, decontamination logged for 3 consecutive runs.'),
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
    qcOutcome: 'Warning',
    qcFailureSummary: 'Internal Control below cut-off in 4 wells (C3, C7, D1, D9).',
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-04T11:05:00',
    samples: buildSamples(727200, 72, 4),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-04T11:05:00',
        'Plate uploaded from MU1_040826.csv',
        '72 wells parsed, 68 samples mapped to LIS orders.'),
      event('qc-evaluated', 'System', 'Automated QC', '2026-08-04T11:05:03',
        'QC warning — Internal Control below cut-off in 4 wells',
        'IC Ct > 34 in C3, C7, D1, D9. Plate controls passed; affected wells flagged individually.'),
      event('capa-raised', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-04T17:45:00',
        'CAPA-2026-015 raised against Internal Control failure',
        'Extraction batch EXT-2208 under investigation.'),
    ],
    capa: [CAPA_MU1],
  },
  {
    plateId: 'AB1P',
    runDate: '3 Aug 2026',
    instrument: 'Molecular Instrument',
    samplesProcessed: 64,
    samplesValid: 55,
    samplesInvalid: 9,
    status: 'Pending',
    qcOutcome: 'Passed',
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-03T10:22:00',
    samples: buildSamples(727100, 64, 9),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-03T10:22:00',
        'Plate uploaded from AB1P_030826.xlsx',
        '64 wells parsed, 60 samples mapped to LIS orders, 4 controls detected.'),
      event('qc-evaluated', 'System', 'Automated QC', '2026-08-03T10:22:05',
        'QC passed — all configured controls within limits'),
      event('validated', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-03T12:40:00',
        'Validated 55 of 64 samples',
        '9 samples marked Needs Review — awaiting consultant sign-off.'),
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
    uploadedBy: 'Anjali Verma',
    uploadedAt: '2026-08-02T09:00:00',
    releasedBy: 'Dr. S. Raghavan',
    releasedAt: '2026-08-02T13:30:00',
    samples: buildSamples(727000, 36, 0),
    auditTrail: [
      event('uploaded', 'Anjali Verma', 'Lab Technologist', '2026-08-02T09:00:00',
        'Plate uploaded from QS5-02_020826.xlsx',
        '36 wells parsed, 32 samples mapped to LIS orders, 4 controls detected.'),
      event('qc-evaluated', 'System', 'Automated QC', '2026-08-02T09:00:04',
        'QC passed — all configured controls within limits'),
      event('validated', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-02T13:12:00',
        'Validated all 36 samples'),
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
    qcFailureSummary: 'Positive Control failed to amplify — no Ct value returned.',
    uploadedBy: 'Pratiksha Gorivale',
    uploadedAt: '2026-08-01T15:18:00',
    rejectedBy: 'Dr. S. Raghavan',
    rejectedAt: '2026-08-01T16:02:00',
    samples: buildSamples(726900, 24, 24),
    auditTrail: [
      event('uploaded', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-01T15:18:00',
        'Plate uploaded from QS5-01_010826.xlsx',
        '24 wells parsed, 20 samples mapped to LIS orders, 4 controls detected.'),
      event('qc-evaluated', 'System', 'Automated QC', '2026-08-01T15:18:02',
        'QC failed — Positive Control did not amplify',
        'PC wells A1 and A2 returned Undetermined. Configured behaviour: fail plate.'),
      event('rejected', 'Dr. S. Raghavan', 'Consultant Microbiologist', '2026-08-01T16:02:00',
        'Plate rejected — full re-run required',
        'Reason: Positive Control failure invalidates all 24 samples. Re-run scheduled for 2 Aug.'),
      event('capa-raised', 'Pratiksha Gorivale', 'Lab Technologist', '2026-08-01T16:30:00',
        'CAPA-2026-013 raised against Positive Control failure',
        'Reagent lot MM-4471 quarantined pending supplier investigation.'),
    ],
    capa: [
      {
        id: 'CAPA-2026-013',
        plateId: 'QS5-01',
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

  const existing = registry.find((p) => p.plateId.toUpperCase() === plateId.toUpperCase())
  const rest = registry.filter((p) => p.plateId.toUpperCase() !== plateId.toUpperCase())

  const samples: PlateSampleRef[] = uploadData.sampleGroups.map((group) => ({
    sampleId: group.sampleId,
    accessionNumber: group.testOrder,
    patient: group.patient,
    wellId: group.rows[0]?.well ?? '—',
    status: group.status,
  }))

  const current: PlateRecord = existing
    ? { ...existing, samplesProcessed: processed, samplesValid: valid, samplesInvalid: invalid, qcOutcome, samples }
    : {
        plateId,
        runDate: uploadData.plateSummary.runDate,
        instrument: uploadData.plateSummary.device || 'Molecular Instrument',
        samplesProcessed: processed,
        samplesValid: valid,
        samplesInvalid: invalid,
        status: 'Pending',
        qcOutcome,
        qcFailureSummary: uploadData.qcBanner.qcPassed
          ? undefined
          : uploadData.qcBanner.failedControlWells.map((w) => `${w.controlType} failed in ${w.wellId}`).join('; '),
        uploadedBy: CURRENT_USER.name,
        uploadedAt: new Date().toISOString(),
        samples,
        auditTrail: [
          {
            id: `evt-live-${plateId}`,
            action: 'uploaded',
            actor: CURRENT_USER.name,
            actorRole: CURRENT_USER.role,
            timestamp: new Date().toISOString(),
            summary: `Plate uploaded from ${uploadData.fileName}`,
            detail: `${uploadData.plateSummary.totalWells} wells parsed, ${processed} samples mapped to LIS orders.`,
          },
        ],
        capa: [],
      }

  return [current, ...rest]
}
