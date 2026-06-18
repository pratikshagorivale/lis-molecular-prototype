import type { InstrumentCard, PreviewRow, SampleGroup, WellData } from '../types'

export const UPLOADED_FILE = 'QS5_UTI_28OCT2024_MU1.xls'
export const PLATE_ID = 'AB1P'
export const DEVICE = 'QS5'
export const RUN_DATE = '28 Oct 2024'

export const instruments: InstrumentCard[] = [
  {
    id: 'molecular',
    name: 'Molecular Instrument',
    category: 'Molecular',
    borderColor: 'border-l-blue-500',
    qcLastSync: '2 hrs ago',
    paramsLastSync: '2 hrs ago',
    lastUploadedPlate: 'AB1P',
    pendingValidation: 12,
    qcCount: 0,
    paramsCount: 12,
    isMolecular: true,
  },
  {
    id: 'microbiology',
    name: 'Microbiology Instrument',
    category: 'Microbiology',
    borderColor: 'border-l-emerald-500',
    qcLastSync: '-',
    paramsLastSync: '-',
    qcCount: 0,
    paramsCount: 0,
  },
  {
    id: 'tox-screen',
    name: 'Toxicology Screening 1',
    category: 'Toxicology',
    borderColor: 'border-l-amber-500',
    qcLastSync: '1 day ago',
    paramsLastSync: '1 day ago',
    qcCount: 2,
    paramsCount: 8,
  },
  {
    id: 'tox-confirm',
    name: 'Toxicology Confirmation Device',
    category: 'Toxicology',
    borderColor: 'border-l-orange-500',
    qcLastSync: '-',
    paramsLastSync: '-',
    qcCount: 0,
    paramsCount: 0,
  },
  {
    id: 'pathology',
    name: 'Advia 360',
    category: 'Pathology',
    borderColor: 'border-l-purple-500',
    qcLastSync: '3 hrs ago',
    paramsLastSync: '3 hrs ago',
    qcCount: 1,
    paramsCount: 24,
  },
]

export const previewRows: PreviewRow[] = [
  { id: '1', sampleId: '000727425', patient: 'Pratiksha Gorivale', testOrder: 'TO-727425', panel: 'UTI Panel', isQc: false, qcType: '', wellPosition: 'A1', targetName: 'Escherichia coli', ctValue: 23, viralLoad: '', interpretation: 'Detected', type: 'Organism', validationStatus: 'Valid', selected: true },
  { id: '2', sampleId: '000727425', patient: 'Pratiksha Gorivale', testOrder: 'TO-727425', panel: 'UTI Panel', isQc: false, qcType: '', wellPosition: 'A2', targetName: 'blaTEM', ctValue: 25, viralLoad: '', interpretation: 'Detected', type: 'Gene', validationStatus: 'Valid', selected: true },
  { id: '3', sampleId: '000727425', patient: 'Pratiksha Gorivale', testOrder: 'TO-727425', panel: 'UTI Panel', isQc: false, qcType: '', wellPosition: 'A3', targetName: 'blaCTX-M', ctValue: 28, viralLoad: '', interpretation: 'Detected', type: 'Gene', validationStatus: 'Valid', selected: true },
  { id: '4', sampleId: 'PC', patient: '', testOrder: '', panel: 'Control', isQc: true, qcType: 'PC', wellPosition: 'A10', targetName: 'Positive Control', ctValue: 22, viralLoad: '', interpretation: 'Passed', type: 'Control', validationStatus: 'Valid', selected: true },
  { id: '5', sampleId: 'NC', patient: '', testOrder: '', panel: 'Control', isQc: true, qcType: 'NC', wellPosition: 'A11', targetName: 'Negative Control', ctValue: '-', viralLoad: '', interpretation: 'Passed', type: 'Control', validationStatus: 'Valid', selected: true },
  { id: '6', sampleId: 'UNKNOWN123', patient: '', testOrder: 'TO-UNKNOWN', panel: 'UTI Panel', isQc: false, qcType: '', wellPosition: 'B1', targetName: 'Klebsiella pneumoniae', ctValue: 20, viralLoad: '', interpretation: 'Detected', type: 'Organism', validationStatus: 'Error', selected: false },
]

export const sampleGroups: SampleGroup[] = [
  {
    sampleId: '000727425',
    patient: 'Pratiksha Gorivale',
    testOrder: 'TO-727425',
    panel: 'UTI Panel',
    status: 'Ready for Release',
    detectedOrganisms: 3,
    resistanceGenes: 4,
    controlsPassed: true,
    selected: false,
    rows: [
      { well: 'A1', plateId: 'AB1P', targetName: 'Escherichia coli', ctValue: 23, interpretation: 'Detected', type: 'Organism', resistantAntibiotics: '-', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'A2', plateId: 'AB1P', targetName: 'blaTEM', ctValue: 25, interpretation: 'Detected', type: 'Gene', resistantAntibiotics: 'Cefotaxime/Ceftriaxone', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'A3', plateId: 'AB1P', targetName: 'blaCTX-M', ctValue: 28, interpretation: 'Detected', type: 'Gene', resistantAntibiotics: 'Ceftazidime/Ceftriaxone', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'A4', plateId: 'AB1P', targetName: 'blaNDM-1', ctValue: 35, interpretation: 'Not Detected', type: 'Gene', resistantAntibiotics: '-', sensitiveAntibiotics: 'Meropenem', status: 'Ready' },
      { well: 'A5', plateId: 'AB1P', targetName: 'Klebsiella pneumoniae', ctValue: 20, interpretation: 'Detected', type: 'Organism', resistantAntibiotics: '-', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'A6', plateId: 'AB1P', targetName: 'blaKPC', ctValue: 18, interpretation: 'Detected', type: 'Gene', resistantAntibiotics: 'Imipenem/Meropenem', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'A7', plateId: 'AB1P', targetName: 'blaVIM', ctValue: 35, interpretation: 'Not Detected', type: 'Gene', resistantAntibiotics: '-', sensitiveAntibiotics: 'Meropenem', status: 'Ready' },
      { well: 'A8', plateId: 'AB1P', targetName: 'Enterococcus faecalis', ctValue: 22, interpretation: 'Detected', type: 'Organism', resistantAntibiotics: '-', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'A9', plateId: 'AB1P', targetName: 'vanA', ctValue: 21, interpretation: 'Detected', type: 'Gene', resistantAntibiotics: 'Vancomycin/Teicoplanin', sensitiveAntibiotics: '-', status: 'Ready' },
    ],
  },
  {
    sampleId: '000727420',
    patient: 'John Smith',
    testOrder: 'TO-727420',
    panel: 'UTI Panel',
    status: 'Needs Review',
    detectedOrganisms: 1,
    resistanceGenes: 0,
    controlsPassed: true,
    selected: false,
    rows: [
      { well: 'B2', plateId: 'AB1P', targetName: 'Escherichia coli', ctValue: 30, interpretation: 'Detected', type: 'Organism', resistantAntibiotics: '-', sensitiveAntibiotics: '-', status: 'Needs Review' },
    ],
  },
  {
    sampleId: '000727431',
    patient: 'Maria Garcia',
    testOrder: 'TO-727431',
    panel: 'UTI Panel',
    status: 'Ready for Release',
    detectedOrganisms: 2,
    resistanceGenes: 3,
    controlsPassed: true,
    selected: false,
    rows: [
      { well: 'B3', plateId: 'AB1P', targetName: 'Escherichia coli', ctValue: 22, interpretation: 'Detected', type: 'Organism', resistantAntibiotics: '-', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'B3', plateId: 'AB1P', targetName: 'Proteus mirabilis', ctValue: 24, interpretation: 'Detected', type: 'Organism', resistantAntibiotics: '-', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'B3', plateId: 'AB1P', targetName: 'blaTEM', ctValue: 26, interpretation: 'Detected', type: 'Gene', resistantAntibiotics: 'Cefotaxime/Ceftriaxone', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'B3', plateId: 'AB1P', targetName: 'blaCTX-M', ctValue: 28, interpretation: 'Detected', type: 'Gene', resistantAntibiotics: 'Ceftazidime/Ceftriaxone', sensitiveAntibiotics: '-', status: 'Ready' },
      { well: 'B3', plateId: 'AB1P', targetName: 'vanA', ctValue: 30, interpretation: 'Detected', type: 'Gene', resistantAntibiotics: 'Vancomycin/Teicoplanin', sensitiveAntibiotics: '-', status: 'Ready' },
    ],
  },
  {
    sampleId: 'UNKNOWN123',
    patient: 'Not Found',
    testOrder: 'TO-UNKNOWN',
    panel: 'UTI Panel',
    status: 'Failed',
    error: 'Sample not found in LIS',
    detectedOrganisms: 1,
    resistanceGenes: 0,
    controlsPassed: false,
    selected: false,
    rows: [
      { well: 'B1', plateId: 'AB1P', targetName: 'Klebsiella pneumoniae', ctValue: 20, interpretation: 'Detected', type: 'Organism', resistantAntibiotics: '-', sensitiveAntibiotics: '-', status: 'Failed' },
    ],
  },
]

export const wellA1Details: WellData = {
  wellId: 'A1',
  plateId: 'AB1P',
  sampleId: '000727425',
  patient: 'Pratiksha Gorivale',
  testOrder: 'TO-727425',
  panel: 'UTI Panel',
  isQc: false,
  qcType: '',
  status: 'ready',
  label: '000727425',
  totalTargetCount: 9,
  detectedCount: 7,
  notDetectedCount: 2,
  detectedTargets: [
    'Escherichia coli',
    'blaTEM',
    'blaCTX-M',
    'Klebsiella pneumoniae',
    'blaKPC',
    'Enterococcus faecalis',
    'vanA',
  ],
  notDetectedTargets: ['blaNDM-1', 'blaVIM'],
  ctValues: [
    { target: 'Escherichia coli', ct: 23, interpretation: 'Detected' },
    { target: 'blaTEM', ct: 25, interpretation: 'Detected' },
    { target: 'blaCTX-M', ct: 28, interpretation: 'Detected' },
    { target: 'blaNDM-1', ct: 35, interpretation: 'Not Detected' },
    { target: 'Klebsiella pneumoniae', ct: 20, interpretation: 'Detected' },
    { target: 'blaKPC', ct: 18, interpretation: 'Detected' },
    { target: 'blaVIM', ct: 35, interpretation: 'Not Detected' },
    { target: 'Enterococcus faecalis', ct: 22, interpretation: 'Detected' },
    { target: 'vanA', ct: 21, interpretation: 'Detected' },
  ],
  validationChecks: [
    { label: 'Sample Found', passed: true },
    { label: 'Ordered Test Found', passed: true },
    { label: 'Report Found', passed: true },
    { label: 'Target Mapped', passed: true },
    { label: 'Controls Passed', passed: true },
  ],
  isFailed: false,
  controlsPassed: true,
}

export const wellB1Details: WellData = {
  wellId: 'B1',
  plateId: 'AB1P',
  sampleId: 'UNKNOWN123',
  patient: 'Not Found',
  testOrder: 'TO-UNKNOWN',
  panel: 'UTI Panel',
  isQc: false,
  qcType: '',
  status: 'failed',
  label: 'UNKNOWN123',
  detectedTargets: ['Klebsiella pneumoniae'],
  notDetectedTargets: [],
  ctValues: [
    { target: 'Klebsiella pneumoniae', ct: 20, interpretation: 'Detected' },
  ],
  validationChecks: [
    { label: 'Sample Found', passed: false },
    { label: 'Ordered Test Found', passed: false },
    { label: 'Report Found', passed: false },
    { label: 'Target Mapped', passed: true },
    { label: 'Controls Passed', passed: true },
  ],
  validationErrors: ['Sample not found in LIS', 'Report not found'],
  isFailed: true,
}

export const activityLogEntries = [
  { time: '10:32 AM', message: 'File uploaded: QS5_UTI_28OCT2024_MU1.xls' },
  { time: '10:32 AM', message: 'Plate map generated from uploaded file' },
  { time: '10:33 AM', message: 'Controls validated' },
  { time: '10:34 AM', message: '68 samples ready for release' },
  { time: '10:34 AM', message: '2 samples need review' },
]

export const RAW_FILE_PREVIEW = `Well,Sample ID,Target,Ct,Interpretation
A1,000727425,Escherichia coli,23,Detected
A2,000727425,blaTEM,25,Detected
A3,000727425,blaCTX-M,28,Detected
A10,PC,Positive Control,22,Passed
A11,NC,Negative Control,-,Passed
A12,NTC,No Template Control,-,Passed
B1,UNKNOWN123,Klebsiella pneumoniae,20,Detected
B2,000727420,Escherichia coli,30,Detected
B3,000727431,Escherichia coli,22,Detected
B4,000727432,Klebsiella pneumoniae,24,Detected
C1,000727435,Escherichia coli,21,Detected
C5,UNKNOWN456,Escherichia coli,24,Detected
D3,000727444,Streptococcus pneumoniae,26,Detected
E2,000727450,Staphylococcus aureus,19,Detected
F4,UNKNOWN789,Staphylococcus aureus,19,Detected
G1,000727456,Escherichia coli,27,Detected
H1,000727458,Proteus mirabilis,29,Detected`

export const FIELD_MAPPINGS = [
  { source: 'Well', target: 'Well Position', status: 'Mapped' },
  { source: 'Sample ID', target: 'Sample ID', status: 'Mapped' },
  { source: 'Target', target: 'Target Name', status: 'Mapped' },
  { source: 'Ct', target: 'Ct Value', status: 'Mapped' },
  { source: 'Interpretation', target: 'Interpretation', status: 'Mapped' },
]

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

type WellSeed = Omit<WellData, 'wellId' | 'plateId'>

function sampleWell(
  sampleId: string,
  patient: string,
  panel: string,
  status: WellData['status'],
  detectedCount: number,
  detectedTargets: string[],
  notDetectedTargets: string[] = [],
  ctValues?: WellData['ctValues'],
  validationChecks?: WellData['validationChecks'],
  validationErrors?: string[],
): WellSeed {
  const passedChecks = [
    { label: 'Sample Found', passed: status !== 'failed' },
    { label: 'Ordered Test Found', passed: status !== 'failed' },
    { label: 'Report Found', passed: status === 'ready' || status === 'control' },
    { label: 'Target Mapped', passed: true },
    { label: 'Controls Passed', passed: status !== 'failed' },
  ]
  return {
    sampleId,
    patient,
    testOrder: '',
    panel,
    isQc: false,
    qcType: '',
    status,
    label: sampleId,
    totalTargetCount: detectedTargets.length + notDetectedTargets.length,
    detectedCount,
    notDetectedCount: notDetectedTargets.length,
    detectedTargets,
    notDetectedTargets,
    ctValues: ctValues ?? detectedTargets.map((t, i) => ({
      target: t,
      ct: 20 + i * 2,
      interpretation: 'Detected' as const,
    })),
    validationChecks: validationChecks ?? passedChecks,
    validationErrors,
    isFailed: status === 'failed',
  }
}

function controlWell(sampleId: string, patient: string, target: string): WellSeed {
  return {
    sampleId,
    patient,
    testOrder: '',
    panel: 'Control',
    isQc: true,
    qcType: sampleId,
    status: 'control',
    label: sampleId,
    totalTargetCount: 1,
    detectedCount: 1,
    notDetectedCount: 0,
    detectedTargets: [target],
    notDetectedTargets: [],
    ctValues: [{ target, ct: sampleId === 'NC' || sampleId === 'NTC' ? '-' : 22, interpretation: 'Passed' }],
    validationChecks: [],
    isFailed: false,
  }
}

const PLATE_WELL_SEEDS: Record<string, WellSeed> = {
  // Row A — primary UTI sample + controls
  ...Object.fromEntries(
    ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'].map((id) => [
      id,
      sampleWell(
        '000727425',
        'Pratiksha Gorivale',
        'UTI Panel',
        'ready',
        7,
        wellA1Details.detectedTargets,
        wellA1Details.notDetectedTargets,
        wellA1Details.ctValues,
        wellA1Details.validationChecks,
      ),
    ]),
  ),
  A10: controlWell('PC', 'Positive Control', 'Positive Control'),
  A11: controlWell('NC', 'Negative Control', 'Negative Control'),
  A12: controlWell('NTC', 'No Template Control', 'NTC'),

  // Row B
  B1: sampleWell('UNKNOWN123', 'Not Found', 'UTI Panel', 'failed', 1, ['Klebsiella pneumoniae'], [], [{ target: 'Klebsiella pneumoniae', ct: 20, interpretation: 'Detected' }], wellB1Details.validationChecks, wellB1Details.validationErrors),
  B2: sampleWell('000727420', 'John Smith', 'UTI Panel', 'review', 1, ['Escherichia coli']),
  B3: sampleWell('000727431', 'Maria Garcia', 'UTI Panel', 'ready', 5, ['Escherichia coli', 'Proteus mirabilis', 'blaTEM', 'blaCTX-M', 'vanA'], ['Klebsiella pneumoniae']),
  B4: sampleWell('000727432', 'Robert Chen', 'UTI Panel', 'ready', 3, ['Klebsiella pneumoniae', 'Enterococcus faecalis', 'blaKPC'], ['Escherichia coli']),
  B5: sampleWell('000727433', 'Sarah Williams', 'UTI Panel', 'review', 2, ['Escherichia coli', 'blaNDM-1'], ['blaVIM']),
  B6: sampleWell('000727434', 'David Miller', 'Respiratory Panel', 'ready', 4, ['Staphylococcus aureus', 'MRSA', 'mecA', 'Panton-Valentine'], []),

  // Row C
  C1: sampleWell('000727435', 'Emily Johnson', 'UTI Panel', 'ready', 6, ['Escherichia coli', 'Klebsiella pneumoniae', 'blaTEM', 'blaCTX-M', 'blaKPC', 'Enterococcus faecalis']),
  C2: sampleWell('000727436', 'Michael Brown', 'UTI Panel', 'ready', 2, ['Proteus mirabilis', 'blaTEM']),
  C3: sampleWell('000727437', 'Lisa Anderson', 'UTI Panel', 'ready', 4, ['Escherichia coli', 'blaTEM', 'blaCTX-M', 'vanA']),
  C4: sampleWell('000727438', 'James Wilson', 'Respiratory Panel', 'ready', 3, ['Haemophilus influenzae', 'Moraxella catarrhalis', 'Streptococcus pneumoniae']),
  C5: sampleWell('UNKNOWN456', 'Not Found', 'UTI Panel', 'failed', 1, ['Escherichia coli'], [], [{ target: 'Escherichia coli', ct: 24, interpretation: 'Detected' }], undefined, ['Sample not found in LIS', 'Duplicate barcode']),
  C6: sampleWell('000727439', 'Patricia Taylor', 'UTI Panel', 'ready', 5, ['Klebsiella pneumoniae', 'blaNDM-1', 'blaVIM', 'blaKPC', 'Enterococcus faecalis']),
  C7: sampleWell('000727440', 'Christopher Lee', 'UTI Panel', 'review', 3, ['Escherichia coli', 'blaTEM', 'blaCTX-M']),
  C8: sampleWell('000727441', 'Jennifer Martinez', 'UTI Panel', 'ready', 2, ['Enterococcus faecalis', 'vanA']),

  // Row D
  D1: sampleWell('000727442', 'Daniel Thompson', 'UTI Panel', 'ready', 4, ['Escherichia coli', 'Proteus mirabilis', 'blaTEM', 'blaCTX-M']),
  D2: sampleWell('000727443', 'Amanda White', 'UTI Panel', 'ready', 3, ['Klebsiella pneumoniae', 'blaKPC', 'blaNDM-1']),
  D3: sampleWell('000727444', 'Matthew Harris', 'Respiratory Panel', 'ready', 5, ['Streptococcus pneumoniae', 'Haemophilus influenzae', 'Moraxella catarrhalis', 'Mycoplasma pneumoniae', 'Chlamydia pneumoniae']),
  D4: sampleWell('000727445', 'Ashley Clark', 'UTI Panel', 'ready', 2, ['Escherichia coli', 'blaTEM']),
  D5: sampleWell('000727446', 'Joshua Lewis', 'UTI Panel', 'ready', 6, ['Klebsiella pneumoniae', 'Enterococcus faecalis', 'blaTEM', 'blaCTX-M', 'blaVIM', 'vanA']),
  D6: sampleWell('000727447', 'Stephanie Walker', 'UTI Panel', 'ready', 1, ['Proteus mirabilis']),
  D7: sampleWell('000727448', 'Andrew Hall', 'UTI Panel', 'review', 2, ['Escherichia coli', 'Klebsiella pneumoniae']),

  // Row E
  E1: sampleWell('000727449', 'Nicole Allen', 'UTI Panel', 'ready', 4, ['Escherichia coli', 'blaTEM', 'blaCTX-M', 'Enterococcus faecalis']),
  E2: sampleWell('000727450', 'Kevin Young', 'Respiratory Panel', 'ready', 3, ['Staphylococcus aureus', 'MRSA', 'mecA']),
  E3: sampleWell('000727451', 'Rachel King', 'UTI Panel', 'ready', 5, ['Klebsiella pneumoniae', 'blaKPC', 'blaNDM-1', 'blaVIM', 'vanA']),
  E4: sampleWell('000727452', 'Brian Wright', 'UTI Panel', 'ready', 2, ['Proteus mirabilis', 'blaTEM']),

  // Row F
  F1: sampleWell('000727453', 'Michelle Scott', 'UTI Panel', 'ready', 3, ['Escherichia coli', 'Klebsiella pneumoniae', 'blaTEM']),
  F2: sampleWell('000727454', 'Jason Green', 'UTI Panel', 'ready', 4, ['Enterococcus faecalis', 'vanA', 'blaCTX-M', 'blaKPC']),
  F3: sampleWell('000727455', 'Laura Adams', 'Respiratory Panel', 'ready', 2, ['Streptococcus pneumoniae', 'Haemophilus influenzae']),
  F4: sampleWell('UNKNOWN789', 'Not Found', 'UTI Panel', 'failed', 1, ['Staphylococcus aureus'], [], [{ target: 'Staphylococcus aureus', ct: 19, interpretation: 'Detected' }], undefined, ['Sample not found in LIS']),

  // Row G
  G1: sampleWell('000727456', 'Ryan Baker', 'UTI Panel', 'ready', 3, ['Escherichia coli', 'blaTEM', 'blaCTX-M']),
  G2: sampleWell('000727457', 'Samantha Nelson', 'UTI Panel', 'review', 2, ['Klebsiella pneumoniae', 'blaKPC']),

  // Row H
  H1: sampleWell('000727458', 'Eric Carter', 'UTI Panel', 'ready', 4, ['Proteus mirabilis', 'Escherichia coli', 'blaTEM', 'Enterococcus faecalis']),
}

function emptyWell(wellId: string): WellData {
  return {
    wellId,
    plateId: PLATE_ID,
    sampleId: '',
    patient: '',
    testOrder: '',
    panel: '',
    isQc: false,
    qcType: '',
    status: 'empty',
    label: '',
    detectedTargets: [],
    notDetectedTargets: [],
    ctValues: [],
    validationChecks: [],
    isFailed: false,
  }
}

export function buildPlateWells(): WellData[] {
  const wells: WellData[] = []

  for (const row of ROWS) {
    for (const col of COLS) {
      const wellId = `${row}${col}`
      const seed = PLATE_WELL_SEEDS[wellId]
      wells.push(
        seed
          ? { wellId, plateId: PLATE_ID, ...seed }
          : emptyWell(wellId),
      )
    }
  }
  return wells
}

export function getWellDetails(wellId: string): WellData | null {
  const wells = buildPlateWells()
  const well = wells.find((w) => w.wellId === wellId)
  if (!well || well.status === 'empty') return null
  if (wellId === 'A1') return wellA1Details
  if (wellId === 'B1') return wellB1Details
  return well
}
