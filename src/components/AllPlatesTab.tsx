import { useMemo, useState } from 'react'
import { Badge } from './ui/Badge'
import { tracePlates } from '../utils/plateTracking'
import { PLATE_STATUS_VARIANT, QC_OUTCOME_VARIANT } from './plateStatusStyles'
import type { PlateLifecycleStatus, PlateRecord } from '../types'

type StatusFilter = 'all' | PlateLifecycleStatus
type QcFilter = 'all' | 'failed-only' | 'capa-open'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Partially Released', label: 'Partially Released' },
  { value: 'Released', label: 'Released' },
  { value: 'Rejected', label: 'Rejected' },
]

const QC_FILTERS: { value: QcFilter; label: string }[] = [
  { value: 'all', label: 'All QC' },
  { value: 'failed-only', label: 'QC Failed / Warning' },
  { value: 'capa-open', label: 'CAPA Open' },
]

interface AllPlatesTabProps {
  plates: PlateRecord[]
  onOpenPlate: (plateId: string, sampleId?: string) => void
}

export function AllPlatesTab({ plates, onOpenPlate }: AllPlatesTabProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [qcFilter, setQcFilter] = useState<QcFilter>('all')

  const { plates: traced, sampleHits } = useMemo(() => tracePlates(plates, search), [plates, search])

  const visible = useMemo(() => traced.filter((plate) => {
    if (statusFilter !== 'all' && plate.status !== statusFilter) return false
    if (qcFilter === 'failed-only' && plate.qcOutcome === 'Passed') return false
    if (qcFilter === 'capa-open' && !plate.capa.some((c) => c.status !== 'Closed')) return false
    return true
  }), [traced, statusFilter, qcFilter])

  const isSearching = search.trim().length > 0

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded px-3 py-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Trace by Plate ID, Sample ID, accession or patient"
            className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white"
          aria-label="Filter by plate status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={qcFilter}
          onChange={(e) => setQcFilter(e.target.value as QcFilter)}
          className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white"
          aria-label="Filter by QC outcome"
        >
          {QC_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">
          {visible.length} of {plates.length} plates
        </span>
      </div>

      {isSearching && sampleHits.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2">
          <p className="text-[11px] font-semibold text-blue-800 uppercase tracking-wide mb-1.5">
            {sampleHits.length} sample match{sampleHits.length === 1 ? '' : 'es'}
          </p>
          <div className="space-y-1">
            {sampleHits.slice(0, 6).map(({ plate, sample }) => (
              <button
                key={`${plate.plateId}-${sample.sampleId}`}
                type="button"
                onClick={() => onOpenPlate(plate.plateId, sample.sampleId)}
                className="w-full text-left text-xs text-slate-700 hover:text-blue-700 flex items-center gap-2 flex-wrap"
              >
                <span className="font-medium tabular-nums">{sample.sampleId}</span>
                <span className="text-slate-400">·</span>
                <span>{sample.patient}</span>
                <span className="text-slate-400">·</span>
                <span>well {sample.wellId}</span>
                <span className="text-slate-400">→</span>
                <span className="font-medium text-blue-600">Plate {plate.plateId}</span>
              </button>
            ))}
            {sampleHits.length > 6 && (
              <p className="text-[11px] text-blue-700">+{sampleHits.length - 6} more — open the plate to see all</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-3 py-2 text-left font-medium">Plate ID</th>
              <th className="px-3 py-2 text-left font-medium">Run Date</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">QC</th>
              <th className="px-3 py-2 text-right font-medium">Processed</th>
              <th className="px-3 py-2 text-right font-medium">Valid</th>
              <th className="px-3 py-2 text-right font-medium">Invalid</th>
              <th className="px-3 py-2 text-left font-medium">Uploaded By</th>
              <th className="px-3 py-2 text-left font-medium">CAPA</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((plate) => {
              const openCapa = plate.capa.filter((c) => c.status !== 'Closed').length
              return (
                <tr
                  key={plate.plateId}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => onOpenPlate(plate.plateId)}
                >
                  <td className="px-3 py-2.5 font-medium text-blue-600">{plate.plateId}</td>
                  <td className="px-3 py-2.5 text-slate-700">{plate.runDate}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={PLATE_STATUS_VARIANT[plate.status]}>{plate.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={QC_OUTCOME_VARIANT[plate.qcOutcome]}>{plate.qcOutcome}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums">{plate.samplesProcessed}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700 tabular-nums font-medium">{plate.samplesValid}</td>
                  <td className="px-3 py-2.5 text-right text-red-600 tabular-nums font-medium">{plate.samplesInvalid}</td>
                  <td className="px-3 py-2.5 text-slate-700">{plate.uploadedBy}</td>
                  <td className="px-3 py-2.5">
                    {plate.capa.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={openCapa > 0 ? 'text-amber-700 font-medium' : 'text-emerald-700'}>
                        {plate.capa.length} {openCapa > 0 ? `(${openCapa} open)` : 'closed'}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  {isSearching ? `No plates match “${search}”` : 'No plates match the selected filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
