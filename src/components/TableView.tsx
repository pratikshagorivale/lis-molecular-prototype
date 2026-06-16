import { useEffect, useState } from 'react'
import { Badge } from './ui/Badge'
import { formatInterpretationDisplay } from '../utils/interpretation'
import type { SampleGroup, WellData } from '../types'

interface TableViewProps {
  groups: SampleGroup[]
  plateWells: WellData[]
  onWellOpen: (well: WellData) => void
  showErrorsOnly: boolean
  searchQuery: string
}

function statusVariant(status: string) {
  if (status === 'Ready for Release' || status === 'Ready') return 'success' as const
  if (status === 'Failed') return 'error' as const
  return 'warning' as const
}

export function TableView({ groups, plateWells, onWellOpen, showErrorsOnly, searchQuery }: TableViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (groups.length === 0) return
    setExpanded((prev) => {
      if (prev.size > 0) return prev
      const ids = [groups[0]?.sampleId, groups.find((g) => g.status === 'Failed')?.sampleId].filter(Boolean) as string[]
      return new Set(ids)
    })
  }, [groups])

  const filtered = groups.filter((g) => {
    if (showErrorsOnly && g.status !== 'Failed') return false
    if (searchQuery && !g.sampleId.includes(searchQuery)) return false
    return true
  })

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const findWellById = (wellId: string) => plateWells.find((w) => w.wellId === wellId)

  const openSampleOverview = (sampleId: string) => {
    const well = plateWells.find((w) => w.sampleId === sampleId && w.status !== 'empty')
    if (well) onWellOpen(well)
  }

  const openWell = (wellId: string) => {
    const well = findWellById(wellId)
    if (well) onWellOpen(well)
  }

  return (
    <div className="border border-slate-200 rounded bg-white overflow-hidden">
      {filtered.map((group) => (
        <div key={group.sampleId} className="border-b border-slate-200 last:border-b-0">
          <div className={`px-3 py-2 flex items-center gap-3 ${group.status === 'Failed' ? 'bg-red-50' : 'bg-blue-50/60'}`}>
            <input
              type="checkbox"
              checked={selected.has(group.sampleId)}
              onChange={() => toggleSelect(group.sampleId)}
              className="rounded border-slate-300 text-blue-600"
            />
            <button onClick={() => toggleExpand(group.sampleId)} className="text-slate-400 hover:text-slate-600">
              <svg className={`w-3.5 h-3.5 transition-transform ${expanded.has(group.sampleId) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-800">Sample ID: {group.sampleId}</span>
                <span className="text-xs text-slate-500">Patient: {group.patient}</span>
                {group.testOrder && <span className="text-xs text-slate-500">Test Order: {group.testOrder}</span>}
                <span className="text-xs text-slate-500">Panel: {group.panel}</span>
                <Badge variant={statusVariant(group.status)}>{group.status}</Badge>
              </div>
              {group.error && (
                <div className="text-[11px] text-red-600 mt-0.5">Error: {group.error}</div>
              )}
              <div className="flex gap-2 mt-1">
                <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                  Detected Organisms: {group.detectedOrganisms}
                </span>
                <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                  Resistance Genes: {group.resistanceGenes}
                </span>
                {group.controlsPassed && (
                  <span className="text-[10px] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-700">
                    Controls Passed
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button className="px-2 py-1 border border-slate-200 rounded text-[11px] text-slate-600 hover:bg-white">
                Order Update
              </button>
              <button
                onClick={() => openSampleOverview(group.sampleId)}
                className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] hover:bg-blue-700"
              >
                Overview
              </button>
            </div>
          </div>

          {expanded.has(group.sampleId) && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="px-2 py-1.5 text-left font-medium">Well</th>
                    <th className="px-2 py-1.5 text-left font-medium">Plate ID</th>
                    <th className="px-2 py-1.5 text-left font-medium">Target Name</th>
                    <th className="px-2 py-1.5 text-left font-medium">Ct Value</th>
                    <th className="px-2 py-1.5 text-left font-medium">Amp Status</th>
                    <th className="px-2 py-1.5 text-left font-medium">Type</th>
                    <th className="px-2 py-1.5 text-left font-medium">Resistant Antibiotics</th>
                    <th className="px-2 py-1.5 text-left font-medium">Sensitive Antibiotics</th>
                    <th className="px-2 py-1.5 text-left font-medium">Status</th>
                    <th className="px-2 py-1.5 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.well} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => openWell(row.well)}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {row.well}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{row.plateId}</td>
                      <td className="px-2 py-1.5 text-slate-700">{row.targetName}</td>
                      <td className="px-2 py-1.5 text-slate-600">{row.ctValue}</td>
                      <td className="px-2 py-1.5">
                        <span className={row.interpretation === 'Detected' ? 'text-red-600 font-medium' : 'text-slate-500'}>
                          {formatInterpretationDisplay(row.interpretation, row.ampStatus)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{row.type}</td>
                      <td className="px-2 py-1.5 text-slate-600">{row.resistantAntibiotics}</td>
                      <td className="px-2 py-1.5 text-slate-600">{row.sensitiveAntibiotics}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <button className="text-blue-600 hover:underline text-[11px]">Release</button>
                          <button className="p-0.5 text-slate-400 hover:text-slate-600">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
