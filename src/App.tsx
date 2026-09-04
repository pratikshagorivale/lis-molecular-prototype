import { useState, useCallback, useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { DeviceResultsValidationHome } from './pages/DeviceResultsValidationHome'
import { MolecularValidation } from './pages/MolecularValidation'
import { WaitingListPage } from './pages/WaitingListPage'
import { MolecularReportEntryPage } from './pages/MolecularReportEntryPage'
import { InstrumentManagementListPage } from './pages/InstrumentManagementListPage'
import { InstrumentDetailPage } from './pages/InstrumentDetailPage'
import { partiallyCompletedEntries } from './data/waitingListMockData'
import { loadManagedInstruments, saveManagedInstruments } from './utils/instrumentStorage'
import {
  addCapaToPlate,
  appendAuditEvent,
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

  const handleRaiseCapa = useCallback((capaPlateId: string, form: CapaFormData, qcFailureSummary: string) => {
    let capaId = ''
    updateRegistry((prev) => {
      const result = addCapaToPlate(prev, capaPlateId, form, qcFailureSummary)
      capaId = result.capaId
      return result.registry
    })
    setToast(`${capaId || 'CAPA'} recorded against Plate ${capaPlateId}.`)
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
    setUploadData((prev) => prev ?? buildDemoUploadData())
    setSelectedWell(null)
    setScreen('validation')
  }, [])

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

  const handleOpenReport = useCallback((entry: WaitingListEntry) => {
    setSelectedWaitingEntry(entry)
    setWaitingView('report')
  }, [])

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
        />
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
          onBack={() => setWaitingView('list')}
          onSelectEntry={setSelectedWaitingEntry}
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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}

export default App
