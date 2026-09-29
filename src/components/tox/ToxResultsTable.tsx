import { Fragment, useState } from 'react'
import { consistencyFor, interpretationFor } from '../../utils/toxConsistency'
import { formatConcentration, isPositionInvalid } from '../../utils/toxEvaluation'
import { AssayBadge } from './AssayBadge'
import type { ToxOrderContext } from '../../data/toxOrderContext'
import type { BatchPosition, CompoundResult, ToxBatch } from '../../types/tox'

/**
 * The results table as the lab reviews it today: drug rows grouped under their
 * sample, with prescribed/consistency alongside the number.
 *
 * What plating adds here is the position chip on the sample header. The flat
 * table cannot say why a result is blocked — that reason lives in the batch's
 * QC, one level up — so the chip carries the state and opens the plate.
 */

export type ConsistencyFilter = 'all' | 'consistent' | 'inconsistent'

function PositionChip({
  position,
  invalid,
  showPlate,
  onOpenPlate,
}: {
  position: BatchPosition
  invalid: boolean
  /** Only worth naming the carrier when the run spans more than one. */
  showPlate: boolean
  onOpenPlate: (position: BatchPosition) => void
}) {
  const tone = invalid
    ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
    : position.requiresDilution
      ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
      : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'

  return (
    <button
      type="button"
      onClick={() => onOpenPlate(position)}
      title="Open this position on the plate"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${tone}`}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM9 4v16M15 4v16M4 10h16M4 15h16" />
      </svg>
      {showPlate ? `${position.plateId} · ${position.positionId}` : position.positionId}
    </button>
  )
}

function StateChip({ position, invalid }: { position: BatchPosition; invalid: boolean }) {
  if (invalid) {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">Invalid · QC failed</span>
  }
  if (position.requiresDilution) {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">Dilute &amp; re-run</span>
  }
  return null
}

interface ToxResultsTableProps {
  batch: ToxBatch
  orderContext: Map<string, ToxOrderContext>
  search: string
  consistencyFilter: ConsistencyFilter
  showNegatives: boolean
  onOpenPlate: (position: BatchPosition) => void
  onRelease: (sampleId: string, compound: string) => void
}

export function ToxResultsTable({
  batch,
  orderContext,
  search,
  consistencyFilter,
  showNegatives,
  onOpenPlate,
  onRelease,
}: ToxResultsTableProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const samples = batch.positions
    .filter((p) => p.type === 'Sample')
    .filter((p) => {
      if (!search) return true
      const order = orderContext.get(p.sampleId)
      const haystack = `${p.sampleId} ${order?.patientName ?? ''} ${order?.patientRef ?? ''}`.toLowerCase()
      return haystack.includes(search.toLowerCase())
    })

  const toggle = (sampleId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(sampleId)) next.delete(sampleId)
      else next.add(sampleId)
      return next
    })
  }

  const rowsFor = (position: BatchPosition, prescribed: string[]): CompoundResult[] => {
    return position.results.filter((result) => {
      const positive = interpretationFor(result) === 'Positive'
      const relevant = positive || prescribed.includes(result.compound)
      if (!showNegatives && !relevant) return false
      if (consistencyFilter === 'all') return true
      return consistencyFor(result, prescribed).consistency.toLowerCase() === consistencyFilter
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1180px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-slate-600">
              <th className="px-2 py-2 w-8"><input type="checkbox" className="accent-blue-600" /></th>
              <th className="px-2 py-2 font-medium">Drug Name</th>
              <th className="px-2 py-2 font-medium">Services</th>
              <th className="px-2 py-2 font-medium">Result</th>
              <th className="px-2 py-2 font-medium">Cut-off</th>
              <th className="px-2 py-2 font-medium">Interpretation</th>
              <th className="px-2 py-2 font-medium">Prescribed</th>
              <th className="px-2 py-2 font-medium">Consistent</th>
              <th className="px-2 py-2 font-medium">Clinical Note</th>
              <th className="px-2 py-2 font-medium">Previous Value</th>
              <th className="px-2 py-2 font-medium">Received</th>
              <th className="px-2 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((position) => {
              const order = orderContext.get(position.sampleId)
              const prescribed = order?.prescribed ?? []
              const isCollapsed = collapsed.has(position.sampleId)
              const rows = rowsFor(position, prescribed)

              return (
                <Fragment key={position.sampleId}>
                  <tr className="bg-slate-50 border-y border-slate-200">
                    <td className="px-2 py-2"><input type="checkbox" className="accent-blue-600" /></td>
                    <td colSpan={9} className="px-2 py-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => toggle(position.sampleId)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isCollapsed ? '▸' : '▾'}
                        </button>
                        <span className="font-semibold text-slate-800">Sample ID: {position.sampleId}</span>
                        {order && (
                          <span className="text-slate-600">
                            Patient: {order.patientRef} - {order.patientName} {order.patientMeta}
                          </span>
                        )}
                        {/* The bridge to plating — everything left of here exists today. */}
                        <PositionChip
                          position={position}
                          invalid={isPositionInvalid(position, batch)}
                          showPlate={batch.plateIds.length > 1}
                          onOpenPlate={onOpenPlate}
                        />
                        <StateChip position={position} invalid={isPositionInvalid(position, batch)} />
                      </div>
                    </td>
                    <td colSpan={2} className="px-2 py-2 text-right whitespace-nowrap">
                      <button className="px-2 py-1 border border-blue-500 text-blue-600 rounded text-[11px] font-medium hover:bg-blue-50 mr-1.5">
                        Order Update
                      </button>
                      <button className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-medium hover:bg-blue-700">
                        Overview
                      </button>
                    </td>
                  </tr>

                  {!isCollapsed && rows.map((result) => {
                    const verdict = consistencyFor(result, prescribed)
                    const inconsistent = verdict.consistency === 'Inconsistent'
                    const prescribedFlag = prescribed.includes(result.compound)

                    return (
                      <tr
                        key={`${position.sampleId}-${result.compound}`}
                        className={`border-b border-slate-100 ${inconsistent ? 'bg-red-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-2 py-1.5"><input type="checkbox" className="accent-blue-600" /></td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <AssayBadge batch={batch} />
                            <span className="text-slate-800 truncate max-w-[180px]" title={result.compound}>
                              {result.compound}
                            </span>
                            {batch.voidedCompounds.includes(result.compound) && (
                              <span
                                title="Calibrator failed — this compound is void across the whole batch"
                                className="text-[9px] font-semibold text-red-700"
                              >
                                voided
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 truncate max-w-[140px]" title={order?.service}>
                          {order?.service ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 text-slate-800 whitespace-nowrap">
                          {formatConcentration(result.concentration)} {batch.unit}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {result.cutOff != null ? formatConcentration(result.cutOff) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={
                            interpretationFor(result) === 'Positive'
                              ? 'text-red-700 font-medium'
                              : 'text-slate-600'
                          }>
                            {interpretationFor(result)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{prescribedFlag ? 'Yes' : '—'}</td>
                        <td className="px-2 py-1.5">
                          <span
                            title={verdict.label}
                            className={inconsistent ? 'text-red-700 font-medium' : 'text-slate-600'}
                          >
                            {verdict.consistency}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 truncate max-w-[130px]" title={order?.clinicalNote}>
                          {order?.clinicalNote || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                          {(() => {
                            const prior = order?.history.find((h) => h.drug === result.compound)
                            if (!prior) return '—'
                            return prior.value === 'Not detected'
                              ? prior.value
                              : `${prior.value} ${prior.unit}`
                          })()}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">
                          {new Date(Date.parse(position.acquiredAt)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onRelease(position.sampleId, result.compound)}
                            disabled={isPositionInvalid(position, batch) || batch.voidedCompounds.includes(result.compound)}
                            title={
                              isPositionInvalid(position, batch)
                                ? 'Blocked — the plate\'s QC failed'
                                : batch.voidedCompounds.includes(result.compound)
                                  ? 'Blocked — the control for this drug failed'
                                  : undefined
                            }
                            className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-medium hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                          >
                            Release
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {!isCollapsed && rows.length === 0 && (
                    <tr className="border-b border-slate-100">
                      <td />
                      <td colSpan={11} className="px-2 py-2 text-[11px] text-slate-500">
                        No drug rows match the current filter for this sample.
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {samples.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-slate-500">No samples match this search.</p>
      )}
    </div>
  )
}
