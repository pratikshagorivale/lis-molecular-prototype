import { useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { ToxBatchView } from '../components/tox/ToxBatchView'
import { ToxResultsTable, type ConsistencyFilter } from '../components/tox/ToxResultsTable'
import { ToxPositionPanel } from '../components/tox/ToxPositionPanel'
import { buildOrderContext } from '../data/toxOrderContext'
import { TOX_INSTRUMENTS } from '../data/toxInstruments'
import { TOX_DEMO_PLATES } from '../data/toxDemoPlates'
import { AllPlatesTab } from '../components/AllPlatesTab'
import { PlateDetailsDrawer } from '../components/PlateDetailsDrawer'
import { CapaModal } from '../components/CapaModal'
import { RejectPlateModal } from '../components/RejectPlateModal'
import { ReleaseConfirmationModal } from '../components/ReleaseConfirmationModal'
import { failuresFromControls, uncoveredFailures } from '../utils/qcFailures'
import type { CapaFormData, PlateQcFailure, PlateRecord } from '../types'
import { batchCounts, toxQcBanner } from '../utils/toxEvaluation'
import type { BatchPosition, ToxBatch } from '../types/tox'

/**
 * Toxicology device results validation.
 *
 * Deliberately the same chrome as Molecular Results Validation: breadcrumb and
 * title, device tabs with pending counts, a sticky QC banner, one toolbar row
 * ending in a segmented view switch, and a details panel docked beside the
 * content rather than floating over it. A technologist who has learned the
 * molecular screen should not have to learn a second layout to read a plate.
 *
 * Feature parity with molecular is deliberate: two views, the same actions, no
 * tox-only additions. The only difference is the content of the table, which
 * stays the drug-row view the lab reviews today.
 */

export type ToxReleaseMode = 'plate' | 'selected' | 'valid-only'

type DeviceTab = 'toxicology' | 'all-plates' | 'pathology' | 'qc'
type ToxView = 'table' | 'plate'

const DEVICE_TABS: { id: DeviceTab; label: string }[] = [
  { id: 'toxicology', label: 'Toxicology' },
  { id: 'all-plates', label: 'All Plates' },
  { id: 'pathology', label: 'Pathology' },
  { id: 'qc', label: 'QC' },
]

const VIEWS: { id: ToxView; label: string }[] = [
  { id: 'table', label: 'Table View' },
  { id: 'plate', label: 'Plate View' },
]

const BANNER_TONE = {
  pass: 'text-emerald-700',
  fail: 'text-red-700',
  warn: 'text-amber-700',
} as const

interface ToxDeviceValidationProps {
  batch: ToxBatch
  instrumentName: string
  parsing?: boolean
  /** Every plate the lab has tracked, molecular and toxicology alike. */
  plates: PlateRecord[]
  onBack: () => void
  onUploadClick: () => void
  onRelease: (mode: ToxReleaseMode) => void
  /** Releasing one drug result on one sample, from the results table. */
  onReleaseResult: (sampleId: string, compound: string) => void
  onReject: (reason: string) => void
  /** Switch the screen to another toxicology plate. */
  onLoadPlate: (plateId: string) => void
  onRaiseCapa: (plateId: string, form: CapaFormData, failure: PlateQcFailure) => void
  onCloseCapa: (plateId: string, capaId: string) => void
}

export function ToxDeviceValidation({
  batch,
  instrumentName,
  parsing,
  plates,
  onBack,
  onUploadClick,
  onRelease,
  onReleaseResult,
  onReject,
  onLoadPlate,
  onRaiseCapa,
  onCloseCapa,
}: ToxDeviceValidationProps) {
  const [activeTab, setActiveTab] = useState<DeviceTab>('toxicology')
  const [view, setView] = useState<ToxView>('table')
  const [search, setSearch] = useState('')
  const [consistencyFilter, setConsistencyFilter] = useState<ConsistencyFilter>('all')
  const [showNegatives, setShowNegatives] = useState(false)
  const [selected, setSelected] = useState<BatchPosition | null>(null)
  const [plateFilter, setPlateFilter] = useState('')
  const [detailPlateId, setDetailPlateId] = useState<string | null>(null)
  const [detailSampleId, setDetailSampleId] = useState<string | undefined>(undefined)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [capaPlateId, setCapaPlateId] = useState<string | null>(null)
  const [releaseMode, setReleaseMode] = useState<ToxReleaseMode | null>(null)

  const orderContext = useMemo(() => buildOrderContext(batch), [batch])
  const counts = useMemo(() => batchCounts(batch), [batch])
  const bannerItems = useMemo(() => toxQcBanner(batch), [batch])

  const qcPassed = batch.qcPassed
  // A plate that has been released or rejected is not offered those actions again.
  const settled = batch.status === 'Released' || batch.status === 'Rejected'
  const releasable = counts.samples - counts.invalid

  // Every toxicology plate the lab has, plus the demo exports, plus whatever is
  // on screen — molecular filters the same way, over the same registry.
  const plateOptions = useMemo(() => {
    const toxInstruments = new Set(TOX_INSTRUMENTS.map((i) => i.name))
    const ids = [
      batch.batchId,
      ...plates.filter((p) => toxInstruments.has(p.instrument)).map((p) => p.plateId),
      ...TOX_DEMO_PLATES.map((p) => p.plateId),
    ].filter(Boolean)
    return [...new Set(ids)]
  }, [plates, batch.batchId])

  const detailPlate = plates.find((p) => p.plateId === detailPlateId) ?? null
  const capaPlate = plates.find((p) => p.plateId === capaPlateId) ?? null

  // One CAPA answers one failed control, so only the uncovered ones are offered.
  const capaFailures = capaPlate
    ? uncoveredFailures(
        failuresFromControls(capaPlate.qcControls),
        capaPlate.capa.map((c) => c.control),
      )
    : []

  const tabPendingCounts: Record<DeviceTab, number> = {
    toxicology: counts.samples,
    'all-plates': plates.filter((p) => p.status === 'Pending').length,
    pathology: 0,
    qc: 0,
  }

  // A run can span several plates or trays and only one can be drawn at a time,
  // so the plate is chosen here and the grid renders that one.
  const plateIds = useMemo(
    () => [...new Set(batch.positions.map((p) => p.plateId || 'Unplated'))],
    [batch],
  )
  const activePlateId = plateIds.includes(plateFilter) ? plateFilter : plateIds[0] ?? ''

  const openPlateAt = (position: BatchPosition) => {
    setView('plate')
    setPlateFilter(position.plateId || 'Unplated')
    setSelected(position)
  }

  // Loading another batch replaces every position object, so a selection held
  // from the previous batch would otherwise keep rendering against the new one.
  // Derived rather than cleared in an effect, so there is no stale frame.
  const selectedPosition = selected && batch.positions.includes(selected) ? selected : null

  const qcBannerClasses = qcPassed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
  const qcBannerTitleClasses = qcPassed ? 'text-emerald-800' : 'text-amber-800'

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 py-2 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1">
              <button onClick={onBack} className="hover:text-blue-600">Device Result Validation</button>
              <span>/</span>
              {/* The device the file came from, not whichever card was clicked.
                  With several tox instruments those are routinely different. */}
              <span>{batch.instrument && !/^unknown/i.test(batch.instrument) ? batch.instrument : instrumentName}</span>
              <span>/</span>
              <span className="font-medium text-slate-700">Plate {batch.batchId}</span>
            </div>
            <h1 className="text-base font-semibold text-slate-800">Toxicology Results Validation</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onUploadClick}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-blue-500 text-blue-600 rounded text-xs font-medium hover:bg-blue-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload New File
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{batch.runDate ? new Date(Date.parse(batch.runDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
            </div>
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
              {tab.label} ({tabPendingCounts[tab.id]})
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'all-plates' && (
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-50">
          <AllPlatesTab
            plates={plates}
            onOpenPlate={(id, sampleId) => { setDetailPlateId(id); setDetailSampleId(sampleId) }}
          />
        </div>
      )}

      {(activeTab === 'pathology' || activeTab === 'qc') && (
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-50">
          <div className="flex items-center justify-center min-h-[280px] bg-white border border-slate-200 rounded text-sm text-slate-500">
            {activeTab === 'pathology' ? 'Pathology results will appear here' : 'QC results will appear here'}
          </div>
        </div>
      )}

      {activeTab === 'toxicology' && (
        <>
          {/* Same treatment as the molecular QC banner: always on when QC has
              something to say, and always on in Plate View, where the plate is
              only readable against the controls that govern it. */}
          {(!qcPassed || view === 'plate') && (
            <div className={`sticky top-0 z-10 border-b px-4 py-1.5 flex items-center gap-2.5 text-[11px] shrink-0 ${qcBannerClasses}`}>
              <span className={`font-semibold shrink-0 ${qcBannerTitleClasses}`}>Plate {batch.batchId}</span>
              <span className="text-slate-300 shrink-0">·</span>
              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                {bannerItems.map((item) => (
                  <span key={item.label} className={BANNER_TONE[item.tone]}>{item.label}</span>
                ))}
              </div>
              <span className="ml-auto shrink-0 flex items-center gap-2">
                <Badge variant="neutral" size="sm">{batch.status}</Badge>
              </span>
            </div>
          )}

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
              value={batch.batchId}
              onChange={(e) => onLoadPlate(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white max-w-[230px]"
              aria-label="Select plate"
            >
              {plateOptions.map((id) => (
                <option key={id} value={id}>Plate: {id}</option>
              ))}
            </select>

            {/* The plate is named by its batch id, shown in the header. This
                only picks which carrier of a multi-carrier run to draw, so it
                is pointless — and contradicts the header — on a single one. */}
            {view === 'plate' && plateIds.length > 1 && (
              <select
                value={activePlateId}
                onChange={(e) => { setPlateFilter(e.target.value); setSelected(null) }}
                className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white max-w-[230px]"
                aria-label={batch.layout === 'rack' ? 'Select tray' : 'Select plate section'}
              >
                {plateIds.map((id, index) => (
                  <option key={id} value={id}>
                    {batch.batchId} · {id} ({index + 1} of {plateIds.length})
                  </option>
                ))}
              </select>
            )}
            <div className="flex-1" />

            <button
              onClick={() => setRejectOpen(true)}
              disabled={settled}
              className="px-2.5 py-1.5 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {view === 'plate' ? 'Reject Plate' : 'Reject Selected'}
            </button>
            {view === 'table' && (
              <button
                onClick={() => setReleaseMode('selected')}
                className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
              >
                Release Selected
              </button>
            )}
            {view === 'plate' && (
              <>
                <button
                  onClick={() => setReleaseMode('valid-only')}
                  disabled={releasable <= 0 || settled}
                  title={settled
                    ? `This plate is already ${batch.status.toLowerCase()}`
                    : releasable <= 0 ? 'No releasable samples on this batch' : undefined}
                  className="px-2.5 py-1.5 border border-blue-600 text-blue-600 rounded text-xs hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Release Valid Only{releasable > 0 ? ` (${releasable})` : ''}
                </button>
                <button
                  onClick={() => setReleaseMode('plate')}
                  disabled={!qcPassed || settled}
                  title={settled
                    ? `This plate is already ${batch.status.toLowerCase()}`
                    : qcPassed ? undefined : 'A failed control blocks a full-plate release'}
                  className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Release Plate
                </button>
              </>
            )}

            <div className="flex items-center border border-slate-200 rounded overflow-hidden ml-auto">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`px-2.5 py-1.5 text-xs ${
                    view === v.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Consistency filters belong to the drug rows, so they travel with them. */}
          {view === 'table' && (
            <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center gap-4 flex-wrap shrink-0">
              {(['all', 'consistent', 'inconsistent'] as ConsistencyFilter[]).map((value) => (
                <label key={value} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="consistency"
                    checked={consistencyFilter === value}
                    onChange={() => setConsistencyFilter(value)}
                    className="accent-blue-600"
                  />
                  {value === 'all' ? 'All' : value === 'consistent' ? 'Consistent' : 'Inconsistent'}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNegatives}
                  onChange={(e) => setShowNegatives(e.target.checked)}
                  className="accent-blue-600"
                />
                Show all {batch.compounds.length} compounds
              </label>
              <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-slate-700 text-white text-[9px] font-bold">S</span>
                  Screening
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-700 text-white text-[9px] font-bold">C</span>
                  Confirmation
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-w-0 overflow-auto p-4 bg-slate-50 space-y-3">
              {parsing && (
                <div className="px-3 py-2 bg-white border border-slate-200 rounded text-xs text-slate-600">
                  Parsing results…
                </div>
              )}

              {view === 'table' && (
                <ToxResultsTable
                  batch={batch}
                  orderContext={orderContext}
                  search={search}
                  consistencyFilter={consistencyFilter}
                  showNegatives={showNegatives}
                  onOpenPlate={openPlateAt}
                  onRelease={onReleaseResult}
                />
              )}
              {view === 'plate' && (
                <ToxBatchView
                  batch={batch}
                  plateId={activePlateId}
                  orderContext={orderContext}
                  selectedPositionId={selectedPosition?.positionId}
                  onPositionClick={setSelected}
                />
              )}
            </div>

            {selectedPosition && (
              <ToxPositionPanel
                key={`${selectedPosition.plateId}-${selectedPosition.positionId}`}
                position={selectedPosition}
                batch={batch}
                orderContext={orderContext.get(selectedPosition.sampleId)}
                onClose={() => setSelected(null)}
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
          onOpenPlateView={() => { setActiveTab('toxicology'); setView('plate'); setDetailPlateId(null) }}
          onRaiseCapa={(id) => { setDetailPlateId(null); setCapaPlateId(id) }}
          onCloseCapa={onCloseCapa}
        />
      )}

      {rejectOpen && (
        <RejectPlateModal
          plateId={batch.batchId}
          sampleCount={counts.samples}
          qcFailed={!qcPassed}
          onClose={() => setRejectOpen(false)}
          onConfirm={(reason) => {
            setRejectOpen(false)
            onReject(reason)
            // CAPA follows a rejection only when QC has something to explain.
            if (!qcPassed) setCapaPlateId(batch.batchId)
          }}
        />
      )}

      {releaseMode && (
        <ReleaseConfirmationModal
          open
          title="Release Toxicology Results"
          mode={releaseMode}
          plateId={batch.batchId}
          validCount={releasable}
          totalCount={counts.samples}
          onClose={() => setReleaseMode(null)}
          onConfirm={() => { onRelease(releaseMode); setReleaseMode(null) }}
        />
      )}

      {capaPlateId && capaFailures.length > 0 && (
        <CapaModal
          plateId={capaPlateId}
          failures={capaFailures}
          coveredLabels={capaPlate?.capa.map((c) => c.controlLabel) ?? []}
          skipLabel="Skip CAPA"
          onClose={() => setCapaPlateId(null)}
          onSkip={() => setCapaPlateId(null)}
          onSubmit={(form, failure) => {
            onRaiseCapa(capaPlateId, form, failure)
            setCapaPlateId(null)
          }}
        />
      )}
    </div>
  )
}
