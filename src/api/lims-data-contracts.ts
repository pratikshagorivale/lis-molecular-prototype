/**
 * LIMS data contracts — production implementations must satisfy these interfaces.
 * No default/mock data: all providers load from LIMS APIs or database.
 *
 * @see docs/lims-implementation-guide.md
 */

import type {
  InstrumentControlConfig,
  InstrumentCard,
  ManagedInstrument,
  ParsedUploadData,
  UserFieldMapping,
} from '../types'

/** Lab target catalog entry (replaces targetMaster.ts + AVAILABLE_TARGETS). */
export interface MolecularTarget {
  id: string
  name: string
  aliases?: string[]
  type: 'Organism' | 'Gene' | 'Control'
  ctCutOff: number | null
  ctCutOffOperator: '<=' | '>' | null
  panelId?: string
  enabled: boolean
}

export interface GeneAntibioticMapping {
  resistantAntibiotics: string
  sensitiveAntibiotics: string
}

export interface LisSampleLookupResult {
  sampleId: string
  patient: string
  panel: string
  patientId?: string
  testOrderId?: string
  accessionNumber?: string
  reportId?: string | null
}

/** Injected into validation engine — all data from LIMS. */
export interface MolecularValidationContext {
  instrumentId: string
  instrumentControls: InstrumentControlConfig[]
  catalogTargets: MolecularTarget[]
  lookupSample: (sampleId: string) => Promise<LisSampleLookupResult | null>
  batchLookupSamples: (sampleIds: string[]) => Promise<Map<string, LisSampleLookupResult>>
  getGeneAntibioticMapping: (targetId: string) => GeneAntibioticMapping | null
  resolveTargetByName: (name: string) => MolecularTarget | null
  panelId?: string
}

export interface InstrumentFieldMappingTemplate {
  id: string
  instrumentId: string
  templateName: string
  mappings: UserFieldMapping[]
  headerRowIndex: number
  dataStartRowIndex: number
  plateSize: 96 | 384 | 1536
}

/** LIMS API surface — implement per lab deployment. */
export interface LimsMolecularApi {
  // Instrument registry
  listInstruments(labId: string): Promise<InstrumentCard[]>
  getManagedInstrument(instrumentId: string): Promise<ManagedInstrument>

  // Control configuration
  getInstrumentControls(instrumentId: string): Promise<InstrumentControlConfig[]>
  saveInstrumentControl(instrumentId: string, control: InstrumentControlConfig): Promise<InstrumentControlConfig>
  deleteInstrumentControl(instrumentId: string, controlId: string): Promise<void>

  // Target catalog
  listMolecularTargets(labId: string, panelId?: string): Promise<MolecularTarget[]>

  // LIS lookup
  lookupSample(sampleId: string, labId: string): Promise<LisSampleLookupResult | null>
  batchLookupSamples(sampleIds: string[], labId: string): Promise<LisSampleLookupResult[]>

  // Field mapping templates
  getMappingTemplates(instrumentId: string): Promise<InstrumentFieldMappingTemplate[]>
  saveMappingTemplate(template: InstrumentFieldMappingTemplate): Promise<InstrumentFieldMappingTemplate>

  // Validation workflow
  validatePlateRun(params: {
    instrumentId: string
    labId: string
    file: File | ArrayBuffer
    fileName: string
    mappings: UserFieldMapping[]
    selectedWellIds?: string[]
    plateId: string
    plateSize: 96 | 384 | 1536
    headerRowIndex: number
    dataStartRowIndex: number
  }): Promise<ParsedUploadData & { plateRunId: string }>

  getPlateRun(plateRunId: string): Promise<ParsedUploadData & { plateRunId: string }>

  releasePlateRun(plateRunId: string, params: {
    mode: 'plate' | 'valid-only' | 'selected'
    sampleIds?: string[]
    wellKeys?: string[]
  }): Promise<{ releasedCount: number }>

  sendToReport(plateRunId: string, params: {
    sampleId?: string
    reportEntryId?: string
  }): Promise<{ reportEntryId: string; patientName: string }>
}
