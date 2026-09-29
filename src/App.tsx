import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { DeviceResultsValidationHome } from './pages/DeviceResultsValidationHome'
import { MolecularValidation } from './pages/MolecularValidation'
import { WaitingListPage } from './pages/WaitingListPage'
import { MolecularReportEntryPage } from './pages/MolecularReportEntryPage'
import { InstrumentManagementListPage } from './pages/InstrumentManagementListPage'
import { InstrumentDetailPage } from './pages/InstrumentDetailPage'
import { ToxDeviceValidation } from './pages/ToxDeviceValidation'
import {
  UploadToxResultsModal,
  type PlateLayoutChoice,
  type PlateOverrides,
} from './components/tox/UploadToxResultsModal'
import {
  applyTemplate,
  buildToxBatchFromTable,
  filterToxBatchByPositions,
  loadToxDemoBatch,
  readToxFile,
  type ToxFileContext,
} from './utils/parseToxFile'
import { TOX_TEMPLATE_CATALOGUE } from './data/toxTemplates'
import {
  TOX_INSTRUMENTS,
  instrumentForTemplate,
  templateForInstrument,
  type ToxInstrument,
} from './data/toxInstruments'
import type { ToxDrugCutOff } from './data/toxDrugs'
import { mergeToxBatchIntoRegistry } from './utils/toxPlateRecord'
import { demoFileForPlate } from './data/toxDemoPlates'
import { batchCounts } from './utils/toxEvaluation'
import type { ToxReleaseMode } from './pages/ToxDeviceValidation'
import type { ToxBatch } from './types/tox'
import type { TemplateFileCheck } from './types/toxTemplate'
import type { ToxControlConfig } from './types/toxControl'
import { partiallyCompletedEntries } from './data/waitingListMockData'
import { loadManagedInstruments, saveManagedInstruments } from './utils/instrumentStorage'
import {
  addCapaToPlate,
  appendAuditEvent,
  closeCapaOnPlate,
  createAuditEvent,
  loadPlateRegistry,
  savePlateRegistry,
} from './utils/plateTracking'
import { CURRENT_USER, mergeUploadIntoRegistry } from './data/plateTrackingMockData'
import { buildMolecularReportFromUpload, resolveWaitingEntryForUpload } from './utils/sendResultsToReport'
import type { MolecularReportData } from './types'
import { UploadMolecularResultsModal } from './components/UploadMolecularResultsModal'
import { ReleaseConfirmationModal } from './components/ReleaseConfirmationModal'
import { Toast } from './components/ui/Toast'
import { buildDemoUploadData } from './data/demoUploadData'
import { buildUploadDataForPlate } from './data/plateUploadData'
import { loadLisRegistry } from './data/lisSampleRegistry'
import {
  readSpreadsheetFile,
  buildUploadDataFromContext,
  createAutoMappings,
  mappingsReadyForPreview,
  syncUserMappingsWithFieldDefs,
  updateFileContextRowSettings,
} from './utils/parseMolecularFile'
import { filterUploadDataBySelection } from './utils/filterUploadBySelection'
import { countReleaseableSamples } from './utils/releaseSamples'
import type {
  AppNav,
  CapaFormData,
  FileParseContext,
  InstrumentControlConfig,
  ManagedInstrument,
  ParsedUploadData,
  PlateQcFailure,
  PlateRecord,
  PlateSize,
  PreviewRow,
  QcView,
  Screen,
  UserFieldMapping,
  WaitingListEntry,
  WellData,
} from './types'

function normalizeHeaderForMapping(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function App() {
  const [activeNav, setActiveNav] = useState<AppNav>('device-validation')
  const [screen, setScreen] = useState<Screen>('home')
  const [waitingView, setWaitingView] = useState<'list' | 'report'>('list')
  const [selectedWaitingEntry, setSelectedWaitingEntry] = useState<WaitingListEntry | null>(null)
  const [reportResultsCache, setReportResultsCache] = useState<Record<string, MolecularReportData>>({})
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [fileContext, setFileContext] = useState<FileParseContext | null>(null)
  const [userMappings, setUserMappings] = useState<UserFieldMapping[]>([])
  const [uploadData, setUploadData] = useState<ParsedUploadData | null>(null)
  const [parsing, setParsing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [plateIdInput, setPlateIdInput] = useState('')
  const [plateSize, setPlateSize] = useState<PlateSize>(96)
  const [selectedWell, setSelectedWell] = useState<WellData | null>(null)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [releaseMode, setReleaseMode] = useState<'plate' | 'selected' | 'valid-only'>('plate')
  const [releaseCounts, setReleaseCounts] = useState({ validCount: 0, totalCount: 0 })
  const [toast, setToast] = useState<string | null>(null)
  const [qcView, setQcView] = useState<QcView>('list')
  const [managedInstruments, setManagedInstruments] = useState<ManagedInstrument[]>(() => loadManagedInstruments())
  const [selectedManagedInstrumentId, setSelectedManagedInstrumentId] = useState<string | null>(null)
  const [plateRegistry, setPlateRegistry] = useState<PlateRecord[]>(() => loadPlateRegistry())

  // Toxicology. Parsers ship in the catalogue, so the upload flow is: pick the
  // instrument, check the file fits, review, continue. Nothing is mapped here.
  const [toxBatch, setToxBatch] = useState<ToxBatch | null>(null)
  const [toxInstrument, setToxInstrument] = useState('')
  const [toxParsing, setToxParsing] = useState(false)
  const [toxModalOpen, setToxModalOpen] = useState(false)
  const [toxFileContext, setToxFileContext] = useState<ToxFileContext | null>(null)
  const [toxPendingBatch, setToxPendingBatch] = useState<ToxBatch | null>(null)
  const [toxUploadError, setToxUploadError] = useState<string | null>(null)
  const [toxInstrumentPick, setToxInstrumentPick] = useState<ToxInstrument | null>(null)
  const [toxCheck, setToxCheck] = useState<TemplateFileCheck | null>(null)

  /** Single write path for the registry so every audit entry is persisted the same way. */
  const updateRegistry = useCallback((updater: (prev: PlateRecord[]) => PlateRecord[]) => {
    setPlateRegistry((prev) => {
      const next = updater(prev)
      savePlateRegistry(next)
      return next
    })
  }, [])

  useEffect(() => {
    loadLisRegistry()
  }, [])

  useEffect(() => {
    setSelectedWell(null)
  }, [uploadData])

  const applyMappings = useCallback(async (
    context: FileParseContext,
    mappings: UserFieldMapping[],
    options?: { plateIdOverride?: string; plateSize?: PlateSize },
  ) => {
    setApplying(true)
    setMappingError(null)
    try {
      const molecularControls = managedInstruments.find((i) => i.isMolecular)?.controls ?? []
      const data = await buildUploadDataFromContext(context, mappings, {
        plateIdOverride: options?.plateIdOverride ?? plateIdInput,
        plateSize: options?.plateSize ?? plateSize,
        instrumentControls: molecularControls,
      })
      setUploadData(data)
      setPlateIdInput(data.plateSummary.plateId?.trim() ?? '')
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'Failed to apply mappings')
      setUploadData(null)
    } finally {
      setApplying(false)
    }
  }, [plateIdInput, plateSize, managedInstruments])

  const molecularControls = managedInstruments.find((i) => i.isMolecular)?.controls ?? []
  const molecularControlsKey = JSON.stringify(molecularControls)

  useEffect(() => {
    if (!fileContext || userMappings.length === 0 || !mappingsReadyForPreview(userMappings)) return
    applyMappings(fileContext, userMappings)
    // Re-apply when instrument control config changes, not on every mapping update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [molecularControlsKey])

  const processFile = useCallback(async (file: File) => {
    setParsing(true)
    setMappingError(null)
    try {
      const context = await readSpreadsheetFile(file)
      const cols = context.sourceColumns
      const headers = cols.map((h) => normalizeHeaderForMapping(h))
      const mappings = syncUserMappingsWithFieldDefs(createAutoMappings(headers, cols))

      setUploadData(null)
      setFileContext(context)
      setUserMappings(mappings)
      // Only pre-fill when Plate ID was actually found (filename/metadata); never invent one.
      setPlateIdInput(context.metadata.plateId?.trim() ?? '')
      await applyMappings(context, mappings, {
        plateIdOverride: context.metadata.plateId?.trim() || undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file'
      setMappingError(message)
      setToast(message)
    } finally {
      setParsing(false)
    }
  }, [applyMappings])

  const handleUploadClick = useCallback(() => {
    setFileContext(null)
    setUserMappings([])
    setMappingError(null)
    setPlateIdInput('')
    setPlateSize(96)
    setScreen('home')
    setUploadModalOpen(true)
  }, [])

  useEffect(() => {
    if (screen === 'validation' && !uploadData) {
      setScreen('home')
    }
  }, [screen, uploadData])

  const handleApplyMappings = useCallback(() => {
    if (fileContext) applyMappings(fileContext, userMappings)
  }, [fileContext, userMappings, applyMappings])

  const handleMappingsChange = useCallback((mappings: UserFieldMapping[]) => {
    const synced = syncUserMappingsWithFieldDefs(mappings)
    setUserMappings(synced)
    if (!fileContext) return
    if (mappingsReadyForPreview(synced)) {
      applyMappings(fileContext, synced)
    } else {
      setUploadData(null)
      setMappingError(null)
    }
  }, [fileContext, applyMappings])

  const handleHeaderRowChange = useCallback((headerRow: number) => {
    if (!fileContext) return
    const updated = updateFileContextRowSettings(fileContext, { headerRow })
    const headers = updated.sourceColumns.map((h) => normalizeHeaderForMapping(h))
    const mappings = syncUserMappingsWithFieldDefs(createAutoMappings(headers, updated.sourceColumns))
    setFileContext(updated)
    setUserMappings(mappings)
    applyMappings(updated, mappings)
  }, [fileContext, applyMappings])

  const handleDataStartRowChange = useCallback((dataStartRow: number) => {
    if (!fileContext) return
    const updated = updateFileContextRowSettings(fileContext, { dataStartRow })
    setFileContext(updated)
    applyMappings(updated, userMappings)
  }, [fileContext, userMappings, applyMappings])

  const handlePlateSizeChange = useCallback((size: PlateSize) => {
    setPlateSize(size)
    if (fileContext) applyMappings(fileContext, userMappings, { plateSize: size })
  }, [fileContext, userMappings, applyMappings])

  const handleWellClick = useCallback((well: WellData) => {
    setSelectedWell(well)
  }, [])

  const openReleaseModal = useCallback((mode: 'plate' | 'selected' | 'valid-only') => {
    if (uploadData) {
      const { validCount, totalCount } = countReleaseableSamples(uploadData.sampleGroups)
      setReleaseCounts({ validCount, totalCount })
    }
    setReleaseMode(mode)
    setReleaseModalOpen(true)
  }, [uploadData])

  const handleReleasePlate = useCallback(() => {
    openReleaseModal('plate')
  }, [openReleaseModal])

  const handleReleaseValidOnly = useCallback(() => {
    openReleaseModal('valid-only')
  }, [openReleaseModal])

  const handleReleaseSelected = useCallback(() => {
    openReleaseModal('selected')
  }, [openReleaseModal])

  const handleConfirmRelease = useCallback(() => {
    setReleaseModalOpen(false)
    const releasedPlateId = uploadData?.plateSummary.plateId?.trim() ?? ''

    const { summary, status } = releaseMode === 'valid-only'
      ? {
          summary: `Released ${releaseCounts.validCount} of ${releaseCounts.totalCount} samples to LIS reports`,
          status: 'Partially Released' as const,
        }
      : releaseMode === 'plate'
        ? {
            summary: `Released all ${releaseCounts.totalCount} sample${releaseCounts.totalCount === 1 ? '' : 's'} to LIS reports`,
            status: 'Released' as const,
          }
        : {
            summary: 'Released selected sample results to LIS reports',
            status: 'Partially Released' as const,
          }

    if (releasedPlateId) {
      updateRegistry((prev) => appendAuditEvent(
        prev,
        releasedPlateId,
        // A partial release is still a release event — only the plate status differs.
        createAuditEvent('released', summary),
        { status, releasedBy: CURRENT_USER.name, releasedAt: new Date().toISOString() },
      ))
    }

    if (releaseMode === 'valid-only') {
      setToast(`${releaseCounts.validCount} valid sample result${releaseCounts.validCount === 1 ? '' : 's'} released successfully.`)
      return
    }
    if (releaseMode === 'plate') {
      setToast(`All ${releaseCounts.totalCount} sample result${releaseCounts.totalCount === 1 ? '' : 's'} released successfully.`)
      return
    }
    setToast('Selected results released successfully.')
  }, [releaseMode, releaseCounts, uploadData, updateRegistry])

  const handleRejectPlate = useCallback((rejectPlateId: string, reason: string) => {
    if (!rejectPlateId) return
    updateRegistry((prev) => appendAuditEvent(
      prev,
      rejectPlateId,
      createAuditEvent('rejected', `Plate rejected — ${reason}`),
      { status: 'Rejected', rejectedBy: CURRENT_USER.name, rejectedAt: new Date().toISOString() },
    ))
    setToast(`Plate ${rejectPlateId} rejected. Reason recorded in the audit trail.`)
  }, [updateRegistry])

  const handleRaiseCapa = useCallback((capaPlateId: string, form: CapaFormData, failure: PlateQcFailure) => {
    let capaId = ''
    updateRegistry((prev) => {
      const result = addCapaToPlate(prev, capaPlateId, form, failure)
      capaId = result.capaId
      return result.registry
    })
    setToast(`${capaId || 'CAPA'} recorded against ${failure.label} on Plate ${capaPlateId}.`)
  }, [updateRegistry])

  const handleContinueToValidation = useCallback((selectionRows: PreviewRow[]) => {
    if (!uploadData) return
    const filtered = filterUploadDataBySelection(uploadData, selectionRows, { instrumentControls: molecularControls })
    setUploadData(filtered)
    updateRegistry((prev) => mergeUploadIntoRegistry(prev, filtered))
    setUploadModalOpen(false)
    setScreen('validation')
  }, [uploadData, molecularControls, updateRegistry])

  const handleOpenMolecularValidation = useCallback(() => {
    setUploadData((prev) => {
      if (prev) return prev
      // One dataset per plate, so the grid always matches that plate's registry samples.
      const first = plateRegistry.find((p) => p.plateId === 'AB1P') ?? plateRegistry[0]
      return first ? buildUploadDataForPlate(first) : buildDemoUploadData()
    })
    setSelectedWell(null)
    setScreen('validation')
  }, [plateRegistry])

  /** Jump from a report to the plate its results came from. */
  const handleOpenPlateFromReport = useCallback((plateId: string) => {
    const plate = plateRegistry.find((p) => p.plateId.toUpperCase() === plateId.toUpperCase())
    if (!plate) return
    setUploadData(buildUploadDataForPlate(plate))
    setSelectedWell(null)
    setActiveNav('device-validation')
    setScreen('validation')
  }, [plateRegistry])

  /**
   * Swap the validation view to another plate from the registry. Skipped once a real
   * file is loaded, so an actual upload is never replaced by demo results.
   */
  const handleLoadPlate = useCallback((nextPlateId: string) => {
    if (fileContext) return
    if (!nextPlateId || uploadData?.plateSummary.plateId === nextPlateId) return
    const plate = plateRegistry.find((p) => p.plateId.toUpperCase() === nextPlateId.toUpperCase())
    if (!plate) return
    setUploadData(buildUploadDataForPlate(plate))
    setSelectedWell(null)
  }, [fileContext, uploadData, plateRegistry])

  const handleSendResults = useCallback((selectionRows: PreviewRow[]) => {
    if (!uploadData) return
    const filtered = filterUploadDataBySelection(uploadData, selectionRows, { instrumentControls: molecularControls })
    const entry = resolveWaitingEntryForUpload(filtered, partiallyCompletedEntries)
    const report = buildMolecularReportFromUpload(entry, filtered.previewRows)
    setReportResultsCache((prev) => ({ ...prev, [entry.id]: report }))
    setSelectedWaitingEntry(entry)
    setWaitingView('report')
    setActiveNav('waiting')
    setUploadModalOpen(false)
    setToast(`Results sent to report entry for ${entry.patientName}.`)
  }, [uploadData, molecularControls])

  const handleCloseModal = useCallback(() => {
    setUploadModalOpen(false)
  }, [])

  const plateId = uploadData?.plateSummary.plateId ?? 'AB1P'

  const handleNavigate = useCallback((id: AppNav) => {
    setActiveNav(id)
    if (id === 'device-validation') setScreen('home')
    if (id === 'waiting') setWaitingView('list')
    if (id === 'qc') {
      setQcView('list')
      setSelectedManagedInstrumentId(null)
    }
  }, [])

  const selectedManagedInstrument = managedInstruments.find((i) => i.id === selectedManagedInstrumentId) ?? null

  const handleSelectManagedInstrument = useCallback((instrumentId: string) => {
    setSelectedManagedInstrumentId(instrumentId)
    setQcView('detail')
  }, [])

  const handleManagedInstrumentBack = useCallback(() => {
    setQcView('list')
    setSelectedManagedInstrumentId(null)
  }, [])

  const handleUpdateInstrumentControls = useCallback((instrumentId: string, controls: InstrumentControlConfig[]) => {
    setManagedInstruments((prev) => {
      const next = prev.map((instrument) => (
        instrument.id === instrumentId ? { ...instrument, controls } : instrument
      ))
      saveManagedInstruments(next)
      return next
    })
    setToast('Control configuration saved.')
  }, [])

  const handleUpdateToxControls = useCallback((instrumentId: string, controls: ToxControlConfig[]) => {
    setManagedInstruments((prev) => {
      const next = prev.map((instrument) => (
        instrument.id === instrumentId ? { ...instrument, toxControls: controls } : instrument
      ))
      saveManagedInstruments(next)
      return next
    })
    // The loaded batch was judged by the old configuration, so drop it rather
    // than leave a stale verdict on screen.
    setToxBatch(null)
    setToast('Control configuration saved.')
  }, [])

  const handleUpdateToxDrugs = useCallback((instrumentId: string, drugs: ToxDrugCutOff[]) => {
    setManagedInstruments((prev) => {
      const next = prev.map((instrument) => (
        instrument.id === instrumentId ? { ...instrument, toxDrugs: drugs } : instrument
      ))
      saveManagedInstruments(next)
      return next
    })
    setToxBatch(null)
    setToast('Reporting cut-offs saved.')
  }, [])

  const handleCloseCapa = useCallback((capaPlateId: string, capaId: string) => {
    updateRegistry((prev) => closeCapaOnPlate(prev, capaPlateId, capaId))
    setToast(`${capaId} closed.`)
  }, [updateRegistry])

  const handleOpenReport = useCallback((entry: WaitingListEntry) => {
    setSelectedWaitingEntry(entry)
    setWaitingView('report')
  }, [])

  /**
   * A chosen parser either reads the file or refuses it. There is no mapping
   * step to fall back on, so the check is the gate.
   */
  const readWithTemplate = useCallback(
    (
      result: { context: ToxFileContext; check: TemplateFileCheck },
      controls: ToxControlConfig[],
      panel?: string,
      drugCutOffs?: ToxDrugCutOff[],
    ) => {
      setToxFileContext(result.context)
      setToxCheck(result.check)
      if (!result.check.ok) {
        setToxPendingBatch(null)
        return
      }
      try {
        setToxPendingBatch(buildToxBatchFromTable(
          result.context.fileName,
          result.context.table,
          result.context.template,
          controls,
          panel,
          drugCutOffs,
        ))
        setToxUploadError(null)
      } catch (err) {
        setToxPendingBatch(null)
        setToxUploadError(err instanceof Error ? err.message : 'That file could not be parsed')
      }
    }, [])

  /**
   * Upload is always opened from a device card, and a device writes one export
   * format — so the instrument, and with it the parser, is settled here rather
   * than asked for in the modal.
   */
  const handleToxUploadClick = useCallback((toxInstrumentId?: string) => {
    setToxFileContext(null)
    setToxPendingBatch(null)
    setToxUploadError(null)
    setToxInstrumentPick(
      TOX_INSTRUMENTS.find((i) => i.id === toxInstrumentId) ?? TOX_INSTRUMENTS[0],
    )
    setToxCheck(null)
    setToxModalOpen(true)
  }, [])

  /** Back to the parser picker, keeping nothing from the rejected attempt. */
  const handleToxReset = useCallback(() => {
    setToxFileContext(null)
    setToxPendingBatch(null)
    setToxUploadError(null)
    setToxCheck(null)
  }, [])

  /** The configured controls for the device the technologist picked. */
  const managedFor = useCallback((instrument: ToxInstrument | null) => (
    instrument
      ? managedInstruments.find(
          (m) => m.isToxicology && (m.id === instrument.id || m.name === instrument.name),
        )
      : undefined
  ), [managedInstruments])

  const toxControlsFor = useCallback(
    (instrument: ToxInstrument | null): ToxControlConfig[] => managedFor(instrument)?.toxControls ?? [],
    [managedFor],
  )

  /** The lab's reporting cut-offs, which decide every patient result. */
  const toxDrugsFor = useCallback(
    (instrument: ToxInstrument | null): ToxDrugCutOff[] | undefined => managedFor(instrument)?.toxDrugs,
    [managedFor],
  )

  const handleToxFileSelect = useCallback(async (file: File, instrument: ToxInstrument) => {
    const template = templateForInstrument(instrument)
    if (!template) {
      setToxUploadError(`No parser is configured for ${instrument.name}.`)
      return
    }
    setToxParsing(true)
    setToxUploadError(null)
    try {
      readWithTemplate(
        await readToxFile(file, template, TOX_TEMPLATE_CATALOGUE),
        toxControlsFor(instrument),
        instrument.panel,
        toxDrugsFor(instrument),
      )
    } catch (err) {
      setToxUploadError(err instanceof Error ? err.message : 'Could not read that file')
      setToxFileContext(null)
      setToxPendingBatch(null)
    } finally {
      setToxParsing(false)
    }
  }, [readWithTemplate, toxControlsFor, toxDrugsFor])

  /** Retry the loaded file as the instrument the mismatch notice suggested. */
  const handleToxUseInstrument = useCallback((instrument: ToxInstrument) => {
    setToxInstrumentPick(instrument)
    const template = templateForInstrument(instrument)
    if (!toxFileContext || !template) return
    readWithTemplate(
      applyTemplate(toxFileContext, template, TOX_TEMPLATE_CATALOGUE),
      toxControlsFor(instrument),
      instrument.panel,
      toxDrugsFor(instrument),
    )
  }, [toxFileContext, readWithTemplate, toxControlsFor, toxDrugsFor])

  /** The instrument whose parser does fit, when the chosen one does not. */
  const toxSuggestion = toxCheck?.suggestion
    ? instrumentForTemplate(toxCheck.suggestion.id, TOX_INSTRUMENTS)
    : null

  /**
   * Re-read under an adjusted layout. How the run was pipetted is a fact the
   * instrument does not record, so a plain vial number becomes a well only
   * when the lab says the run was plated.
   */
  const handleToxLayoutChange = useCallback((layout: PlateLayoutChoice) => {
    if (!toxFileContext) return
    const base = toxFileContext.template
    const adjusted = layout === 'rack'
      ? { ...base, position: { ...base.position, fill: undefined }, plateSize: 'auto' as const }
      : {
          ...base,
          position: { ...base.position, fill: 'row-major' as const },
          plateSize: Number(layout) as 96 | 384,
        }
    try {
      setToxPendingBatch(buildToxBatchFromTable(
        toxFileContext.fileName,
        toxFileContext.table,
        adjusted,
        toxControlsFor(toxInstrumentPick),
        toxInstrumentPick?.panel,
        toxDrugsFor(toxInstrumentPick),
      ))
    } catch (err) {
      setToxUploadError(err instanceof Error ? err.message : 'That layout could not be applied')
    }
  }, [toxFileContext, toxInstrumentPick, toxControlsFor, toxDrugsFor])

  const handleToxContinue = useCallback((
    selectedPositionIds: string[],
    overrides: PlateOverrides,
  ) => {
    if (!toxPendingBatch) return
    const filtered = filterToxBatchByPositions(toxPendingBatch, new Set(selectedPositionIds))
    // The instrument the technologist picked is the batch's identity — not a
    // string scraped out of the file, and not whichever card was clicked. The
    // plate id and run date are theirs to correct.
    setToxBatch({
      ...filtered,
      instrument: toxInstrumentPick?.name ?? filtered.instrument,
      batchId: overrides.plateId.trim() || filtered.batchId,
      runDate: overrides.runDate || filtered.runDate,
    })
    setToxModalOpen(false)
    setActiveNav('device-validation')
    setScreen('tox-validation')
    setToxInstrument(toxInstrumentPick?.name ?? filtered.instrument)
    setToast(`${selectedPositionIds.length} sample${selectedPositionIds.length === 1 ? '' : 's'} loaded for validation.`)
  }, [toxPendingBatch, toxInstrumentPick])

  const loadToxBatch = useCallback(async (fileName: string) => {
    setToxParsing(true)
    try {
      setToxBatch(await loadToxDemoBatch(fileName, (instrumentName) => {
        const managed = managedInstruments.find(
          (m) => m.isToxicology && m.name === instrumentName,
        )
        return { controls: managed?.toxControls ?? [], drugCutOffs: managed?.toxDrugs }
      }))
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not load the toxicology batch')
    } finally {
      setToxParsing(false)
    }
  }, [managedInstruments])

  const handleOpenTox = useCallback((instrumentName: string) => {
    setToxInstrument(instrumentName)
    setActiveNav('device-validation')
    setScreen('tox-validation')
    if (!toxBatch) loadToxBatch('15SEP2026_LCMS6_MP_301.csv')
  }, [toxBatch, loadToxBatch])

  /**
   * A toxicology plate is tracked in the same registry molecular uses, so its
   * audit trail and CAPAs sit alongside every other plate. The batch is folded
   * in on the way past, in case this is the first action taken on it.
   */
  const handleToxRelease = useCallback((mode: ToxReleaseMode) => {
    const plateId = toxBatch?.batchId ?? ''
    if (!toxBatch || !plateId) return

    const counts = batchCounts(toxBatch)
    const valid = counts.samples - counts.invalid
    const whole = mode === 'plate'
    const { summary, status, toast } = whole
      ? {
          summary: `Released all ${counts.samples} sample results to LIS reports`,
          status: 'Released' as const,
          toast: `All ${counts.samples} sample results released successfully.`,
        }
      : mode === 'valid-only'
        ? {
            summary: `Released ${valid} of ${counts.samples} samples to LIS reports`,
            status: 'Partially Released' as const,
            toast: `${valid} valid sample result${valid === 1 ? '' : 's'} released successfully.`,
          }
        : {
            summary: 'Released selected sample results to LIS reports',
            status: 'Partially Released' as const,
            toast: 'Selected results released successfully.',
          }

    updateRegistry((prev) => appendAuditEvent(
      mergeToxBatchIntoRegistry(prev, toxBatch),
      plateId,
      createAuditEvent('released', summary),
      whole
        ? { status, releasedBy: CURRENT_USER.name, releasedAt: new Date().toISOString() }
        : { status },
    ))
    // The screen has to show the outcome, not just announce it.
    setToxBatch((prev) => (prev ? { ...prev, status } : prev))
    setToast(toast)
  }, [toxBatch, updateRegistry])

  /**
   * Reopen another toxicology plate. The registry keeps what a run produced,
   * not the run itself, so a plate can only be reopened while its export is
   * still available — the demo ones are, an uploaded one is not.
   */
  const handleLoadToxPlate = useCallback((plateId: string) => {
    if (plateId === toxBatch?.batchId) return
    const fileName = demoFileForPlate(plateId)
    if (!fileName) {
      setToast(`Upload the export for Plate ${plateId} again to open it.`)
      return
    }
    loadToxBatch(fileName)
  }, [toxBatch, loadToxBatch])

  const handleToxReleaseResult = useCallback((sampleId: string, compound: string) => {
    setToast(`${compound} on ${sampleId} released to the LIS report.`)
  }, [])

  const handleToxReject = useCallback((reason: string) => {
    const plateId = toxBatch?.batchId ?? ''
    if (!plateId) return
    updateRegistry((prev) => appendAuditEvent(
      mergeToxBatchIntoRegistry(prev, toxBatch),
      plateId,
      createAuditEvent('rejected', `Plate rejected — ${reason}`),
      { status: 'Rejected', rejectedBy: CURRENT_USER.name, rejectedAt: new Date().toISOString() },
    ))
    setToxBatch((prev) => (prev ? { ...prev, status: 'Rejected' } : prev))
    setToast(`Plate ${plateId} rejected. Reason recorded in the audit trail.`)
  }, [toxBatch, updateRegistry])

  // Derived, so All Plates shows the batch on screen before any action on it.
  const toxPlates = useMemo(
    () => mergeToxBatchIntoRegistry(plateRegistry, toxBatch),
    [plateRegistry, toxBatch],
  )

  const handleWaitingListValidate = useCallback((_entry: WaitingListEntry) => {
    setActiveNav('device-validation')
    setScreen('home')
  }, [])

  return (
    <AppLayout activeNav={activeNav} onNavigate={handleNavigate}>
      {activeNav === 'device-validation' && screen === 'home' && (
        <DeviceResultsValidationHome
          onUploadClick={handleUploadClick}
          onOpenMolecular={handleOpenMolecularValidation}
          onOpenTox={handleOpenTox}
          onUploadTox={handleToxUploadClick}
          lastUploadedPlate={uploadData?.plateSummary.plateId}
          pendingValidation={uploadData?.validationSummary.validSamples}
        />
      )}
      {activeNav === 'device-validation' && screen === 'validation' && uploadData && (
        <MolecularValidation
          uploadData={uploadData}
          plateRegistry={plateRegistry}
          selectedWell={selectedWell}
          instrumentControls={managedInstruments.find((i) => i.isMolecular)?.controls ?? []}
          onCloseWell={() => setSelectedWell(null)}
          onBack={() => setScreen('home')}
          onUploadNew={handleUploadClick}
          onWellClick={handleWellClick}
          onReleasePlate={handleReleasePlate}
          onReleaseValidOnly={handleReleaseValidOnly}
          onReleaseSelected={handleReleaseSelected}
          onRejectPlate={handleRejectPlate}
          onRaiseCapa={handleRaiseCapa}
          onCloseCapa={handleCloseCapa}
          onLoadPlate={handleLoadPlate}
        />
      )}
      {activeNav === 'device-validation' && screen === 'tox-validation' && toxBatch && (
        <ToxDeviceValidation
          batch={toxBatch}
          instrumentName={toxInstrument}
          parsing={toxParsing}
          onBack={() => setScreen('home')}
          onUploadClick={handleToxUploadClick}
          plates={toxPlates}
          onLoadPlate={handleLoadToxPlate}
          onRelease={handleToxRelease}
          onReleaseResult={handleToxReleaseResult}
          onReject={handleToxReject}
          onRaiseCapa={handleRaiseCapa}
          onCloseCapa={handleCloseCapa}
        />
      )}
      {activeNav === 'device-validation' && screen === 'tox-validation' && !toxBatch && (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
          {toxParsing ? 'Parsing toxicology results…' : 'No toxicology batch loaded.'}
        </div>
      )}
      {activeNav === 'waiting' && waitingView === 'list' && (
        <WaitingListPage
          onOpenReport={handleOpenReport}
          onValidate={handleWaitingListValidate}
        />
      )}
      {activeNav === 'waiting' && waitingView === 'report' && selectedWaitingEntry && (
        <MolecularReportEntryPage
          entry={selectedWaitingEntry}
          queue={partiallyCompletedEntries}
          reportOverride={reportResultsCache[selectedWaitingEntry.id] ?? null}
          plateRegistry={plateRegistry}
          onBack={() => setWaitingView('list')}
          onSelectEntry={setSelectedWaitingEntry}
          onOpenPlate={handleOpenPlateFromReport}
          onCloseCapa={handleCloseCapa}
        />
      )}
      {activeNav === 'qc' && qcView === 'list' && (
        <InstrumentManagementListPage
          instruments={managedInstruments}
          onSelectInstrument={handleSelectManagedInstrument}
        />
      )}
      {activeNav === 'qc' && qcView === 'detail' && selectedManagedInstrument && (
        <InstrumentDetailPage
          instrument={selectedManagedInstrument}
          onBack={handleManagedInstrumentBack}
          onUpdateControls={(controls) => handleUpdateInstrumentControls(selectedManagedInstrument.id, controls)}
          onUpdateToxControls={(controls) => handleUpdateToxControls(selectedManagedInstrument.id, controls)}
          onUpdateToxDrugs={(drugs) => handleUpdateToxDrugs(selectedManagedInstrument.id, drugs)}
        />
      )}

      <UploadMolecularResultsModal
        open={uploadModalOpen}
        onClose={handleCloseModal}
        onContinue={handleContinueToValidation}
        onSendResults={handleSendResults}
        fileContext={fileContext}
        uploadData={uploadData}
        userMappings={userMappings}
        onMappingsChange={handleMappingsChange}
        onApplyMappings={handleApplyMappings}
        onFileSelect={processFile}
        applying={applying}
        parsing={parsing}
        mappingError={mappingError}
        plateId={plateIdInput}
        onPlateIdChange={setPlateIdInput}
        plateSize={plateSize}
        onPlateSizeChange={handlePlateSizeChange}
        headerRow={(fileContext?.headerRowIndex ?? 0) + 1}
        dataStartRow={(fileContext?.dataStartRowIndex ?? 1) + 1}
        totalRows={fileContext?.rawRows.length ?? 0}
        onHeaderRowChange={handleHeaderRowChange}
        onDataStartRowChange={handleDataStartRowChange}
      />

      <ReleaseConfirmationModal
        open={releaseModalOpen}
        onClose={() => setReleaseModalOpen(false)}
        onConfirm={handleConfirmRelease}
        mode={releaseMode}
        plateId={plateId}
        validCount={releaseCounts.validCount}
        totalCount={releaseCounts.totalCount}
      />

      <UploadToxResultsModal
        open={toxModalOpen}
        onClose={() => setToxModalOpen(false)}
        onContinue={handleToxContinue}
        onLayoutChange={handleToxLayoutChange}
        onFileSelect={handleToxFileSelect}
        onUseInstrument={handleToxUseInstrument}
        selectedInstrument={toxInstrumentPick}
        suggestion={toxSuggestion}
        context={toxFileContext}
        batch={toxPendingBatch}
        check={toxCheck}
        onReset={handleToxReset}
        parsing={toxParsing}
        error={toxUploadError}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}

export default App
