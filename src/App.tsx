import { useState, useCallback, useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { DeviceResultsValidationHome } from './pages/DeviceResultsValidationHome'
import { MolecularValidation } from './pages/MolecularValidation'
import { WaitingListPage } from './pages/WaitingListPage'
import { MolecularReportEntryPage } from './pages/MolecularReportEntryPage'
import { partiallyCompletedEntries } from './data/waitingListMockData'
import { buildMolecularReportFromUpload, resolveWaitingEntryForUpload } from './utils/sendResultsToReport'
import type { MolecularReportData } from './types'
import { UploadMolecularResultsModal } from './components/UploadMolecularResultsModal'
import { WellDetailsDrawer } from './components/WellDetailsDrawer'
import { ReleaseConfirmationModal } from './components/ReleaseConfirmationModal'
import { Toast } from './components/ui/Toast'
import { loadLisRegistry } from './data/lisSampleRegistry'
import {
  readSpreadsheetFile,
  buildUploadDataFromContext,
  createAutoMappings,
  mappingsReadyForPreview,
  updateFileContextRowSettings,
} from './utils/parseMolecularFile'
import type { AppNav, FileParseContext, ParsedUploadData, PlateSize, Screen, UserFieldMapping, WaitingListEntry, WellData } from './types'

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
  const [releaseMode, setReleaseMode] = useState<'plate' | 'selected'>('plate')
  const [toast, setToast] = useState<string | null>(null)

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
      const data = await buildUploadDataFromContext(context, mappings, {
        plateIdOverride: options?.plateIdOverride ?? plateIdInput,
        plateSize: options?.plateSize ?? plateSize,
      })
      setUploadData(data)
      setPlateIdInput(data.plateSummary.plateId)
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'Failed to apply mappings')
      setUploadData(null)
    } finally {
      setApplying(false)
    }
  }, [plateIdInput, plateSize])

  const processFile = useCallback(async (file: File) => {
    setParsing(true)
    setMappingError(null)
    setUploadData(null)
    try {
      const context = await readSpreadsheetFile(file)
      const cols = context.sourceColumns
      const headers = cols.map((h) => normalizeHeaderForMapping(h))
      const mappings = createAutoMappings(headers, cols)

      setFileContext(context)
      setUserMappings(mappings)
      setPlateIdInput(context.metadata.plateId)
      await applyMappings(context, mappings, { plateIdOverride: context.metadata.plateId })
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to read file')
    } finally {
      setParsing(false)
    }
  }, [applyMappings])

  const handleUploadClick = useCallback(() => {
    setFileContext(null)
    setUploadData(null)
    setUserMappings([])
    setMappingError(null)
    setPlateIdInput('')
    setPlateSize(96)
    setUploadModalOpen(true)
  }, [])

  const handleApplyMappings = useCallback(() => {
    if (fileContext) applyMappings(fileContext, userMappings)
  }, [fileContext, userMappings, applyMappings])

  const handleMappingsChange = useCallback((mappings: UserFieldMapping[]) => {
    setUserMappings(mappings)
    if (!fileContext) return
    if (mappingsReadyForPreview(mappings)) {
      applyMappings(fileContext, mappings)
    } else {
      setUploadData(null)
      setMappingError(null)
    }
  }, [fileContext, applyMappings])

  const handleHeaderRowChange = useCallback((headerRow: number) => {
    if (!fileContext) return
    const updated = updateFileContextRowSettings(fileContext, { headerRow })
    const headers = updated.sourceColumns.map((h) => normalizeHeaderForMapping(h))
    const mappings = createAutoMappings(headers, updated.sourceColumns)
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

  const handleReleasePlate = useCallback(() => {
    setReleaseMode('plate')
    setReleaseModalOpen(true)
  }, [])

  const handleReleaseSelected = useCallback(() => {
    setReleaseMode('selected')
    setReleaseModalOpen(true)
  }, [])

  const handleConfirmRelease = useCallback(() => {
    setReleaseModalOpen(false)
    setToast('Results released successfully.')
  }, [])

  const handleContinueToValidation = useCallback(() => {
    if (!uploadData) return
    setUploadModalOpen(false)
    setScreen('validation')
  }, [uploadData])

  const handleSendResults = useCallback(() => {
    if (!uploadData) return
    const entry = resolveWaitingEntryForUpload(uploadData, partiallyCompletedEntries)
    const report = buildMolecularReportFromUpload(entry, uploadData.previewRows)
    setReportResultsCache((prev) => ({ ...prev, [entry.id]: report }))
    setSelectedWaitingEntry(entry)
    setWaitingView('report')
    setActiveNav('waiting')
    setUploadModalOpen(false)
    setToast(`Results sent to report entry for ${entry.patientName}.`)
  }, [uploadData])

  const handleCloseModal = useCallback(() => {
    setUploadModalOpen(false)
  }, [])

  const plateId = uploadData?.plateSummary.plateId ?? 'AB1P'

  const handleNavigate = useCallback((id: AppNav) => {
    setActiveNav(id)
    if (id === 'device-validation') setScreen('home')
    if (id === 'waiting') setWaitingView('list')
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
          lastUploadedPlate={uploadData?.plateSummary.plateId}
          pendingValidation={uploadData?.validationSummary.validSamples}
        />
      )}
      {activeNav === 'device-validation' && screen === 'validation' && uploadData && (
        <MolecularValidation
          uploadData={uploadData}
          onBack={() => setScreen('home')}
          onWellClick={handleWellClick}
          onReleasePlate={handleReleasePlate}
          onReleaseSelected={handleReleaseSelected}
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

      <WellDetailsDrawer well={selectedWell} onClose={() => setSelectedWell(null)} />

      <ReleaseConfirmationModal
        open={releaseModalOpen}
        onClose={() => setReleaseModalOpen(false)}
        onConfirm={handleConfirmRelease}
        mode={releaseMode}
        plateId={plateId}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}

export default App
