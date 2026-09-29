import type { ToxControlConfig } from '../types/toxControl'
import type { ManagedInstrument } from '../types'

export const AVAILABLE_ORGANISMS = [
  'Escherichia coli',
  'Klebsiella pneumoniae',
  'Enterococcus faecalis',
  'Proteus mirabilis',
  'Staphylococcus aureus',
]

export const AVAILABLE_GENES = [
  'blaTEM',
  'blaCTX-M',
  'blaNDM-1',
  'vanA',
  'mecA',
]

/** Combined catalog for validation lookups that do not need type. */
export const AVAILABLE_TARGETS = [...AVAILABLE_ORGANISMS, ...AVAILABLE_GENES]

/**
 * Controls as the LCMS6 pain-management method runs them: a three-point curve
 * and low/high/blank QCs, named exactly as MassHunter writes them in the file.
 * Windows are the panel defaults; a lab tightens them per drug where it must.
 */
const LCMS6_CONTROLS: ToxControlConfig[] = [
  { id: 'lcms6-l1', controlType: 'Calibrator', control: 'L1', level: '1', scope: 'panel', operator: '>=', cutOff: '0.5', failureBehavior: 'fail-drug' },
  { id: 'lcms6-l2', controlType: 'Calibrator', control: 'L2', level: '2', scope: 'panel', operator: '>=', cutOff: '1.5', failureBehavior: 'fail-drug' },
  { id: 'lcms6-l3', controlType: 'Calibrator', control: 'L3', level: '3', scope: 'panel', operator: '>=', cutOff: '30', failureBehavior: 'fail-drug' },
  { id: 'lcms6-qcl', controlType: 'QC', control: 'QC L', scope: 'panel', operator: '>=', cutOff: '1', failureBehavior: 'fail-drug' },
  { id: 'lcms6-qch', controlType: 'QC', control: 'QC H', scope: 'panel', operator: '>=', cutOff: '20', failureBehavior: 'fail-drug' },
  // A panel-wide cut-off is a coarse floor: every drug on the level must at
  // least register. Per-drug reporting limits live on the Drugs tab.
  // The carryover blank is read the other way round, and contaminates the whole
  // run, so it fails the plate rather than a drug.
  { id: 'lcms6-qcn', controlType: 'Blank', control: 'QC N', scope: 'panel', operator: '<', cutOff: '30', failureBehavior: 'fail-plate' },
]

/**
 * Orion runs a five-point Surine curve; LabSolutions writes the full name.
 *
 * Scoped to the drugs the calibrator actually contains. The rest of the 148
 * compounds on the screen are not in the mix and sit at the reporting floor, so
 * a panel-wide floor would fail them every run for no clinical reason.
 */
const ORION_CONTROLS: ToxControlConfig[] = [
  {
    id: 'orion-c1', controlType: 'Calibrator', control: 'Frankenstein_Surine_Cal_1',
    level: '1', scope: 'targeted', operator: '>=', failureBehavior: 'fail-drug',
    drugs: [{ id: 'o1-1', drug: 'Morphine', cutOff: '12.87' }, { id: 'o1-2', drug: 'Codeine', cutOff: '12.39' }, { id: 'o1-3', drug: 'Oxycodone', cutOff: '13.8' }, { id: 'o1-4', drug: 'Hydrocodone', cutOff: '13.0' }, { id: 'o1-5', drug: 'Hydromorphone', cutOff: '13.23' }, { id: 'o1-6', drug: 'Oxymorphone', cutOff: '13.12' }, { id: 'o1-7', drug: '6-MAM', cutOff: '4.54' }, { id: 'o1-8', drug: 'Tapentadol', cutOff: '13.38' }, { id: 'o1-9', drug: 'Gabapentin', cutOff: '143.0' }, { id: 'o1-10', drug: 'Pregabalin', cutOff: '148.0' }, { id: 'o1-11', drug: 'Acetaminophen', cutOff: '127.0' }, { id: 'o1-12', drug: 'Cotinine', cutOff: '5.55' }],
  },
  {
    id: 'orion-c2', controlType: 'Calibrator', control: 'Frankenstein_Surine_Cal_2',
    level: '2', scope: 'targeted', operator: '>=', failureBehavior: 'fail-drug',
    drugs: [{ id: 'o2-1', drug: 'Morphine', cutOff: '21.08' }, { id: 'o2-2', drug: 'Codeine', cutOff: '24.45' }, { id: 'o2-3', drug: 'Oxycodone', cutOff: '23.09' }, { id: 'o2-4', drug: 'Hydrocodone', cutOff: '23.04' }, { id: 'o2-5', drug: 'Hydromorphone', cutOff: '23.2' }, { id: 'o2-6', drug: 'Oxymorphone', cutOff: '22.39' }, { id: 'o2-7', drug: '6-MAM', cutOff: '10.92' }, { id: 'o2-8', drug: 'Tapentadol', cutOff: '23.89' }, { id: 'o2-9', drug: 'Gabapentin', cutOff: '221.0' }, { id: 'o2-10', drug: 'Pregabalin', cutOff: '212.0' }, { id: 'o2-11', drug: 'Acetaminophen', cutOff: '228.0' }, { id: 'o2-12', drug: 'Cotinine', cutOff: '9.04' }],
  },
  {
    id: 'orion-c3', controlType: 'Calibrator', control: 'Frankenstein_Surine_Cal_3',
    level: '3', scope: 'targeted', operator: '>=', failureBehavior: 'fail-drug',
    drugs: [{ id: 'o3-1', drug: 'Morphine', cutOff: '294.0' }, { id: 'o3-2', drug: 'Codeine', cutOff: '260.0' }, { id: 'o3-3', drug: 'Oxycodone', cutOff: '240.0' }, { id: 'o3-4', drug: 'Hydrocodone', cutOff: '263.0' }, { id: 'o3-5', drug: 'Hydromorphone', cutOff: '254.0' }, { id: 'o3-6', drug: 'Oxymorphone', cutOff: '268.0' }, { id: 'o3-7', drug: '6-MAM', cutOff: '59.0' }, { id: 'o3-8', drug: 'Tapentadol', cutOff: '241.0' }, { id: 'o3-9', drug: 'Gabapentin', cutOff: '2458.0' }, { id: 'o3-10', drug: 'Pregabalin', cutOff: '2395.0' }, { id: 'o3-11', drug: 'Acetaminophen', cutOff: '2672.0' }, { id: 'o3-12', drug: 'Cotinine', cutOff: '98.0' }],
  },
  {
    id: 'orion-c4', controlType: 'Calibrator', control: 'Frankenstein_Surine_Cal_4',
    level: '4', scope: 'targeted', operator: '>=', failureBehavior: 'fail-drug',
    drugs: [{ id: 'o4-1', drug: 'Morphine', cutOff: '1168.0' }, { id: 'o4-2', drug: 'Codeine', cutOff: '1232.0' }, { id: 'o4-3', drug: 'Oxycodone', cutOff: '1270.0' }, { id: 'o4-4', drug: 'Hydrocodone', cutOff: '1230.0' }, { id: 'o4-5', drug: 'Hydromorphone', cutOff: '1244.0' }, { id: 'o4-6', drug: 'Oxymorphone', cutOff: '1224.0' }, { id: 'o4-7', drug: '6-MAM', cutOff: '499.0' }, { id: 'o4-8', drug: 'Tapentadol', cutOff: '1265.0' }, { id: 'o4-9', drug: 'Gabapentin', cutOff: '12166.0' }, { id: 'o4-10', drug: 'Pregabalin', cutOff: '12646.0' }, { id: 'o4-11', drug: 'Acetaminophen', cutOff: '12740.0' }, { id: 'o4-12', drug: 'Cotinine', cutOff: '506.0' }],
  },
  {
    id: 'orion-c5', controlType: 'Calibrator', control: 'Frankenstein_Surine_Cal_5.',
    level: '5', scope: 'targeted', operator: '>=', failureBehavior: 'fail-drug',
    drugs: [{ id: 'o5-1', drug: 'Morphine', cutOff: '2544.0' }, { id: 'o5-2', drug: 'Codeine', cutOff: '2508.0' }, { id: 'o5-3', drug: 'Oxycodone', cutOff: '2490.0' }, { id: 'o5-4', drug: 'Hydrocodone', cutOff: '2509.0' }, { id: 'o5-5', drug: 'Hydromorphone', cutOff: '2503.0' }, { id: 'o5-6', drug: 'Oxymorphone', cutOff: '2510.0' }, { id: 'o5-7', drug: '6-MAM', cutOff: '1000.0' }, { id: 'o5-8', drug: 'Tapentadol', cutOff: '2494.0' }, { id: 'o5-9', drug: 'Gabapentin', cutOff: '25387.0' }, { id: 'o5-10', drug: 'Pregabalin', cutOff: '24974.0' }, { id: 'o5-11', drug: 'Acetaminophen', cutOff: '24607.0' }, { id: 'o5-12', drug: 'Cotinine', cutOff: '996.0' }],
  },
]

export const managedInstruments: ManagedInstrument[] = [
  {
    id: 'molecular',
    name: 'Molecular Instrument',
    instrumentType: 'Molecular',
    connectionStatus: 'Disconnected',
    authKey: 'e0476b58-abe0-40cc-b279-cf1eb2c80f6f',
    enabled: true,
    isMolecular: true,
    controls: [
      {
        id: 'ctrl-pc',
        controlType: 'Positive Control',
        control: 'PC',
        scope: 'targeted',
        targets: [
          { id: 't1', target: 'Organism 1', type: 'Organism', ctCutOff: '—', status: 'Detected' },
          { id: 't2', target: 'Organism 2', type: 'Organism', ctCutOff: '—', status: 'Detected' },
          { id: 't3', target: 'Organism 3', type: 'Organism', ctCutOff: '—', status: 'Detected' },
          { id: 't4', target: 'Organism 4', type: 'Organism', ctCutOff: '—', status: 'Detected' },
        ],
        targetedFailureBehavior: 'fail-plate',
      },
      {
        id: 'ctrl-nc',
        controlType: 'Negative Control',
        control: 'NC',
        scope: 'plate',
        status: 'Not Detected',
        plateFailureBehavior: 'fail-plate',
      },
      {
        id: 'ctrl-ntc',
        controlType: 'NTC',
        control: 'NTC',
        scope: 'plate',
        status: 'Not Detected',
        plateFailureBehavior: 'fail-plate',
      },
      {
        id: 'ctrl-ic',
        controlType: 'Internal Control',
        control: 'IC',
        scope: 'plate',
        status: 'Detected',
        plateFailureBehavior: 'fail-plate',
      },
    ],
  },
  {
    id: 'hbpro',
    name: 'HBPro',
    instrumentType: 'Hematology Analyzer',
    connectionStatus: 'Connected',
    authKey: 'a12b34c5-d6e7-4890-abcd-ef1234567890',
    enabled: true,
    controls: [],
  },
  {
    id: 'yumizen-h500',
    name: 'Yumizen H 500',
    instrumentType: 'Hematology',
    connectionStatus: 'Connected',
    authKey: 'b23c45d6-e7f8-4901-bcde-f12345678901',
    enabled: true,
    controls: [],
  },
  {
    id: 'pentra-400',
    name: 'Pentra 400',
    instrumentType: 'Immunoassay',
    connectionStatus: 'Connected',
    authKey: 'c34d56e7-f890-4012-cdef-123456789012',
    enabled: true,
    controls: [],
  },
  {
    id: 'nulyte',
    name: 'Nulyte',
    instrumentType: 'Biochemistry',
    connectionStatus: 'Connected',
    authKey: 'd45e67f8-0901-4123-def0-234567890123',
    enabled: true,
    controls: [],
  },
  {
    id: 'yhlo-esr',
    name: 'YHLO ESR',
    instrumentType: 'Harmones',
    connectionStatus: 'Disconnected',
    authKey: 'e56f78a9-1012-4234-ef01-345678901234',
    enabled: false,
    controls: [],
  },
  {
    id: 'lcms6',
    name: 'LCMS6',
    instrumentType: 'LC-MS/MS — Toxicology',
    connectionStatus: 'Connected',
    authKey: 'TOX-LCMS6-2F41',
    enabled: true,
    isToxicology: true,
    templateId: 'agilent-masshunter-wide',
    controls: [],
    toxControls: LCMS6_CONTROLS,
  },
  {
    id: 'orion-s9',
    name: 'Orion (S9)',
    instrumentType: 'LC-MS/MS — Toxicology',
    connectionStatus: 'Connected',
    authKey: 'TOX-ORION-9C07',
    enabled: true,
    isToxicology: true,
    templateId: 'shimadzu-labsolutions-long',
    controls: [],
    toxControls: ORION_CONTROLS,
  },
]
