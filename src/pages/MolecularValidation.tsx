import { useEffect, useMemo, useState } from 'react'
import { TableView } from '../components/TableView'
import { PlateView } from '../components/PlateView'
import { AllPlatesTab } from '../components/AllPlatesTab'
import { PlateDetailsDrawer } from '../components/PlateDetailsDrawer'
import { CapaModal } from '../components/CapaModal'
import { RejectPlateModal } from '../components/RejectPlateModal'
import { WellDetailsPanel } from '../components/WellDetailsDrawer'
import { Badge } from '../components/ui/Badge'
import { mergeUploadIntoRegistry } from '../data/plateTrackingMockData'
import { countValidWells } from '../utils/releaseSamples'
import { controlValidationsForWell } from '../utils/qcDetection'
import { isControlTypeConfigured } from '../utils/controlEvaluation'
import type {
  CapaFormData,
  FailedControlWell,
  InstrumentControlConfig,
  ParsedUploadData,
  PlateRecord,
  WellData,
} from '../types'

type DeviceValidationTab = 'molecular' | 'all-plates' | 'pathology' | 'qc'

const DEVICE_TABS: { id: DeviceValidationTab; label: string }[] = [
  { id: 'molecular', label: 'Molecular' },
  { id: 'all-plates', label: 'All Plates' },
  { id: 'pathology', label: 'Pathology' },
  { id: 'qc', label: 'QC' },
]

function failedWellsCompact(failed: FailedControlWell[] | undefined, controlType: string): string {
  const wells = (failed ?? []).filter((f) => f.controlType === controlType)
  if (wells.length === 0) return ''
  return wells.map((f) => `${f.wellId} (${f.label})`).join(', ')
}

function parseRunDateToIso(runDate: string): string {
  const parsed = Date.parse(runDate)
  if (Number.isNaN(parsed)) return ''
  const date = new Date(parsed)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateFilterLabel(isoDate: string): string {
  if (!isoDate) return 'Select date'
  const parsed = Date.parse(isoDate)
  if (Number.isNaN(parsed)) return isoDate
  return new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface MolecularValidationProps {
  uploadData: ParsedUploadData
  plateRegistry: PlateRecord[]
  selectedWell?: WellData | null
  instrumentControls?: InstrumentControlConfig[]
  onCloseWell: () => void
  onBack: () => void
  onUploadNew?: () => void
  onWellClick: (well: WellData) => void
  onReleasePlate: () => void
  onReleaseValidOnly: () => void
  onReleaseSelected: () => void
  onRejectPlate: (plateId: string, reason: string) => void
  onRaiseCapa: (plateId: string, form: CapaFormData, qcFailureSummary: string) => void
  /** Load another demo plate's results into the validation view. */
  onLoadPlate?: (plateId: string) => void
}

export function MolecularValidation({
  uploadData,
  plateRegistry,
  selectedWell,
  instrumentControls = [],
  onCloseWell,
  onBack,
  onUploadNew,
  onWellClick,
  onReleasePlate,
  onReleaseValidOnly,
  onReleaseSelected,
  onRejectPlate,
  onRaiseCapa,
  onLoadPlate,
}: MolecularValidationProps) {
  const { plateSummary, qcBanner, sampleGroups, plateWells, plateViewReadiness, mappedTargetMetrics } = uploadData
  const plateId = plateSummary.plateId?.trim() || ''
  const [activeTab, setActiveTab] = useState<DeviceValidationTab>('molecular')
  const [view, setView] = useState<'table' | 'plate'>('table')
  const [search, setSearch] = useState('')
  const [selectedPlateFilter, setSelectedPlateFilter] = useState(plateId)
  const [runDateFilter, setRunDateFilter] = useState(() => parseRunDateToIso(plateSummary.runDate))

  useEffect(() => {
    setRunDateFilter(parseRunDateToIso(plateSummary.runDate))
  }, [plateSummary.runDate])

  useEffect(() => {
    if (plateId) setSelectedPlateFilter(plateId)
  }, [plateId])

  const [detailPlateId, setDetailPlateId] = useState<string | null>(null)
  const [detailSampleId, setDetailSampleId] = useState<string | undefined>(undefined)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [capaPlateId, setCapaPlateId] = useState<string | null>(null)

  const allPlates = useMemo(() => mergeUploadIntoRegistry(plateRegistry, uploadData), [plateRegistry, uploadData])
  const plateFilterOptions = useMemo(() => {
    const ids = allPlates.map((p) => p.plateId)
    if (plateId && !ids.some((id) => id.toUpperCase() === plateId.toUpperCase())) {
      return [plateId, ...ids]
    }
    return ids.length > 0 ? ids : plateId ? [plateId] : []
  }, [allPlates, plateId])

  const activePlateId = selectedPlateFilter || plateId
  const plateLabel = activePlateId || 'Plate ID missing'

  const filteredSampleGroups = useMemo(() => {
    if (!activePlateId) return sampleGroups
    return sampleGroups.filter((g) =>
      g.rows.some((r) => !r.plateId || r.plateId.toUpperCase() === activePlateId.toUpperCase()),
    )
  }, [sampleGroups, activePlateId])

  const filteredPlateWells = useMemo(() => {
    if (!activePlateId) return plateWells
    return plateWells.map((well) => {
      if (well.status === 'empty') return well
      if (!well.plateId || well.plateId.toUpperCase() === activePlateId.toUpperCase()) return well
      return { ...well, status: 'empty' as const, label: '', sampleId: '', isQc: false }
    })
  }, [plateWells, activePlateId])

  const validWellCount = useMemo(() => countValidWells(filteredPlateWells), [filteredPlateWells])
  const controlValidations = useMemo(
    () => (selectedWell ? controlValidationsForWell(selectedWell, filteredPlateWells, instrumentControls) : []),
    [selectedWell, filteredPlateWells, instrumentControls],
  )

  const openPlateViewForPlate = (nextPlateId: string) => {
    onLoadPlate?.(nextPlateId)
    setSelectedPlateFilter(nextPlateId)
    setActiveTab('molecular')
    setView('plate')
    setDetailPlateId(null)
    onCloseWell()
  }

  const openPlateDetails = (nextPlateId: string, sampleId?: string) => {
    setDetailPlateId(nextPlateId)
    setDetailSampleId(sampleId)
  }

  const detailPlate = allPlates.find((p) => p.plateId === detailPlateId) ?? null
  const capaPlate = allPlates.find((p) => p.plateId === capaPlateId) ?? null
  const handleConfirmReject = (reason: string) => {
    setRejectModalOpen(false)
    onRejectPlate(activePlateId, reason)
    // CAPA follows a rejection only when there is a QC failure to explain, and is skippable.
    if (!qcBanner.qcPassed) setCapaPlateId(activePlateId)
  }

  const handleSubmitCapa = (form: CapaFormData) => {
    if (!capaPlateId) return
    const summary = capaPlate?.qcFailureSummary
      ?? qcBanner.failedControlWells.map((w) => `${w.controlType} failed in well ${w.wellId}`).join('; ')
      ?? 'QC failure recorded on this plate.'
    onRaiseCapa(capaPlateId, form, summary || 'QC failure recorded on this plate.')
    setCapaPlateId(null)
  }

  const canShowPlateView = plateViewReadiness.wellColumnMapped && Boolean(activePlateId)

  const showConfiguredControl = (type: 'PC' | 'NC' | 'NTC' | 'IC') =>
    instrumentControls.length === 0 || isControlTypeConfigured(type, instrumentControls)

  const plateStatus = qcBanner.qcPassed
    ? { label: 'Valid', variant: 'success' as const }
    : { label: 'Needs review', variant: 'warning' as const }

  const qcBannerClasses = qcBanner.qcPassed
    ? 'bg-emerald-50 border-emerald-200'
    : 'bg-amber-50 border-amber-200'

  const qcBannerTitleClasses = qcBanner.qcPassed
    ? 'text-emerald-800'
    : 'text-amber-800'

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 py-2 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1">
              <button onClick={onBack} className="hover:text-blue-600">Device Result Validation</button>
              <span>/</span>
              <span>Molecular Instrument</span>
              <span>/</span>
              <span className={`font-medium ${activePlateId ? 'text-slate-700' : 'text-amber-700'}`}>
                {activePlateId ? `Plate ${activePlateId}` : plateLabel}
              </span>
            </div>
            <h1 className="text-base font-semibold text-slate-800">Molecular Results Validation</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onUploadNew && (
              <button
                type="button"
                onClick={onUploadNew}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-blue-500 text-blue-600 rounded text-xs font-medium hover:bg-blue-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload New File
              </button>
            )}
            <label className="relative flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white cursor-pointer hover:bg-slate-50">
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formatDateFilterLabel(runDateFilter)}</span>
            <input
              type="date"
              value={runDateFilter}
              onChange={(e) => setRunDateFilter(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Filter by run date"
            />
          </label>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 px-4 shrink-0">
        <nav className="flex items-center gap-5" aria-label="Device validation tabs">
          {DEVICE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'all-plates' && (
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-50">
          <AllPlatesTab plates={allPlates} onOpenPlate={openPlateDetails} />
        </div>
      )}

      {(activeTab === 'pathology' || activeTab === 'qc') && (
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-50">
          <div className="flex items-center justify-center min-h-[280px] bg-white border border-slate-200 rounded text-sm text-slate-500">
            {activeTab === 'pathology' ? 'Pathology results will appear here' : 'QC results will appear here'}
          </div>
        </div>
      )}

      {activeTab === 'molecular' && (!qcBanner.qcPassed || (view === 'plate' && canShowPlateView)) && (
      <div className={`sticky top-0 z-10 border-b px-4 py-1.5 flex items-center gap-2.5 text-[11px] shrink-0 ${qcBannerClasses}`}>
        <span className={`font-semibold shrink-0 ${qcBannerTitleClasses}`}>
          {activePlateId ? `Plate ${activePlateId}` : plateLabel}
        </span>
        <span className="text-slate-300 shrink-0">·</span>
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          {showConfiguredControl('PC') && (
            qcBanner.pcPresent ? (
              <span className={qcBanner.pcPassed ? 'text-emerald-700' : 'text-red-700'}>
                {qcBanner.pcPassed
                  ? 'PC Passed'
                  : `PC Failed${failedWellsCompact(qcBanner.failedControlWells, 'PC') ? ` · ${failedWellsCompact(qcBanner.failedControlWells, 'PC')}` : ''}`}
              </span>
            ) : (
              <span className="text-amber-700">PC Missing</span>
            )
          )}
          {showConfiguredControl('NC') && (
            qcBanner.ncPresent ? (
              <span className={qcBanner.ncPassed ? 'text-emerald-700' : 'text-red-700'}>
                {qcBanner.ncPassed
                  ? 'NC Passed'
                  : `NC Failed${failedWellsCompact(qcBanner.failedControlWells, 'NC') ? ` · ${failedWellsCompact(qcBanner.failedControlWells, 'NC')}` : ''}`}
              </span>
            ) : (
              <span className="text-amber-700">NC Missing</span>
            )
          )}
          {showConfiguredControl('NTC') && qcBanner.ntcPresent && (
            <span className={qcBanner.ntcPassed ? 'text-emerald-700' : 'text-red-700'}>
              {qcBanner.ntcPassed
                ? 'NTC Passed'
                : `NTC Failed${failedWellsCompact(qcBanner.failedControlWells, 'NTC') ? ` · ${failedWellsCompact(qcBanner.failedControlWells, 'NTC')}` : ''}`}
            </span>
          )}
          {showConfiguredControl('IC') && qcBanner.icPresent && (
            <span className={qcBanner.icPassed ? 'text-emerald-700' : 'text-red-700'}>
              {qcBanner.icPassed
                ? 'IC Passed'
                : `IC Failed${failedWellsCompact(qcBanner.failedControlWells, 'IC') ? ` · ${failedWellsCompact(qcBanner.failedControlWells, 'IC')}` : ''}`}
            </span>
          )}
        </div>
        <span className="ml-auto shrink-0 flex items-center gap-2">
          {!qcBanner.qcPassed && (
            <button
              type="button"
              onClick={() => setCapaPlateId(activePlateId)}
              className="px-2 py-0.5 border border-amber-400 text-amber-800 rounded text-[11px] font-medium hover:bg-amber-100"
            >
              Raise CAPA
            </button>
          )}
          <Badge variant={plateStatus.variant} size="sm">
            {plateStatus.label}
          </Badge>
        </span>
      </div>
      )}

      {activeTab === 'molecular' && (
      <>
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by Sample ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-2 py-1.5 border border-slate-200 rounded text-xs w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={activePlateId}
          onChange={(e) => setSelectedPlateFilter(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white"
          aria-label="Filter by plate"
        >
          {plateFilterOptions.length === 0 ? (
            <option value="">Filter by Plate: —</option>
          ) : (
            plateFilterOptions.map((id) => (
              <option key={id} value={id}>Filter by Plate: {id}</option>
            ))
          )}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setRejectModalOpen(true)}
          disabled={!activePlateId}
          title={activePlateId ? undefined : 'A Plate ID is required to reject a plate'}
          className="px-2.5 py-1.5 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {view === 'plate' ? 'Reject Plate' : 'Reject Selected'}
        </button>
        {view === 'table' && (
          <button onClick={onReleaseSelected} className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
            Release Selected
          </button>
        )}
        {view === 'plate' && canShowPlateView && (
          <>
            <button
              onClick={onReleaseValidOnly}
              disabled={validWellCount === 0}
              title={validWellCount === 0 ? 'No valid wells available to release' : undefined}
              className="px-2.5 py-1.5 border border-blue-600 text-blue-600 rounded text-xs hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Release Valid Only{validWellCount > 0 ? ` (${validWellCount})` : ''}
            </button>
            <button onClick={onReleasePlate} className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
              Release Plate
            </button>
          </>
        )}
        <div className="flex items-center border border-slate-200 rounded overflow-hidden ml-auto">
          <button
            onClick={() => setView('table')}
            className={`px-2.5 py-1.5 text-xs ${view === 'table' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Table View
          </button>
          <button
            onClick={() => setView('plate')}
            className={`px-2.5 py-1.5 text-xs ${view === 'plate' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Plate View
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-auto p-4 bg-slate-50">
          {view === 'table' ? (
            <TableView
              groups={filteredSampleGroups}
              plateWells={filteredPlateWells}
              onWellOpen={onWellClick}
              searchQuery={search}
            />
          ) : !canShowPlateView ? (
            <div className="flex items-center justify-center min-h-[320px]">
              <div className="max-w-md w-full bg-white border border-amber-200 rounded-lg p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h2 className="text-sm font-semibold text-amber-800 mb-1">Plate view unavailable</h2>
                    <p className="text-sm text-amber-700 leading-relaxed">
                      {plateViewReadiness.message
                        ?? 'Plate cannot be formed — Plate ID and well positions were not found. Map Well Position and Plate ID in Field Mapping, or enter a Plate ID manually before continuing.'}
                    </p>
                    <ul className="mt-3 text-xs text-slate-600 space-y-1">
                      {!plateViewReadiness.wellColumnMapped && (
                        <li>• Well Position column is not mapped</li>
                      )}
                      {!activePlateId && (
                        <li>• Plate ID is not mapped or provided</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <PlateView
              wells={filteredPlateWells}
              selectedWellId={selectedWell?.wellId ?? null}
              onWellClick={onWellClick}
            />
          )}
        </div>
        {selectedWell && (
          <WellDetailsPanel
            well={selectedWell}
            controlValidations={controlValidations}
            mappedTargetMetrics={mappedTargetMetrics}
            onClose={onCloseWell}
            onAddCapa={activePlateId ? () => setCapaPlateId(activePlateId) : undefined}
          />
        )}
      </div>
      </>
      )}

      {detailPlate && (
        <PlateDetailsDrawer
          key={`${detailPlate.plateId}-${detailSampleId ?? ''}`}
          plate={detailPlate}
          highlightSampleId={detailSampleId}
          onClose={() => setDetailPlateId(null)}
          onOpenPlateView={openPlateViewForPlate}
          onRaiseCapa={(id) => {
            setDetailPlateId(null)
            setCapaPlateId(id)
          }}
        />
      )}

      {rejectModalOpen && (
        <RejectPlateModal
          plateId={activePlateId}
          sampleCount={filteredSampleGroups.length}
          qcFailed={!qcBanner.qcPassed}
          onClose={() => setRejectModalOpen(false)}
          onConfirm={handleConfirmReject}
        />
      )}

      {capaPlateId && (
        <CapaModal
          plateId={capaPlateId}
          qcFailureSummary={
            capaPlate?.qcFailureSummary
            || qcBanner.failedControlWells.map((w) => `${w.controlType} failed in well ${w.wellId}`).join('; ')
            || 'QC failure recorded on this plate.'
          }
          skipLabel="Skip CAPA"
          onClose={() => setCapaPlateId(null)}
          onSkip={() => setCapaPlateId(null)}
          onSubmit={handleSubmitCapa}
        />
      )}
    </div>
  )
}
