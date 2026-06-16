import { Fragment, useMemo, useState } from 'react'
import { partiallyCompletedEntries } from '../data/waitingListMockData'
import type { WaitingListEntry, WaitingListTag } from '../types'

type ListView = 'patients' | 'service' | 'instrument'

interface WaitingListPageProps {
  onOpenReport?: (entry: WaitingListEntry) => void
  onValidate?: (entry: WaitingListEntry) => void
}

function TagBadge({ tag }: { tag: WaitingListTag }) {
  const styles = {
    insurance: 'bg-blue-50 text-blue-600 border-blue-100',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    trends: 'bg-violet-50 text-violet-700 border-violet-100',
  }
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium ${styles[tag.variant]}`}>
      {tag.label}
    </span>
  )
}

function FilterIcon() {
  return (
    <svg className="w-3 h-3 text-slate-400 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  )
}

export function WaitingListPage({ onOpenReport, onValidate }: WaitingListPageProps) {
  const [listView, setListView] = useState<ListView>('service')
  const [search, setSearch] = useState('')
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return partiallyCompletedEntries
    return partiallyCompletedEntries.filter(
      (e) =>
        e.accessionNo.toLowerCase().includes(q)
        || e.patientName.toLowerCase().includes(q)
        || e.service.toLowerCase().includes(q),
    )
  }, [search])

  const grouped = useMemo(() => {
    const map = new Map<string, WaitingListEntry[]>()
    for (const entry of filtered) {
      const list = map.get(entry.dateGroup) ?? []
      list.push(entry)
      map.set(entry.dateGroup, list)
    }
    return [...map.entries()]
  }, [filtered])

  const toggleDate = (date: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <select className="text-xs border border-slate-200 rounded px-2 py-1.5 text-slate-700 bg-white">
            <option>All Departments</option>
            <option>Molecular</option>
            <option>Microbiology</option>
          </select>
          <select className="text-xs border border-slate-200 rounded px-2 py-1.5 text-slate-700 bg-white">
            <option>Select Branches</option>
            <option>BioScience Main</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Jun 1, 2026 - Jun 12, 2026
          </div>
          <button type="button" className="p-1.5 border border-slate-200 rounded text-slate-500 hover:bg-slate-50 bg-white">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-6 shrink-0">
            {([
              ['patients', 'Patients Waiting List'],
              ['service', 'Service-wise Waiting List'],
              ['instrument', 'Instrument-wise Waiting List'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setListView(id)}
                className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  listView === id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0">
            <div className="relative flex-1 max-w-2xl">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Select by Patient Id / Name / Accession Number / National ID / DOB(MMDDYYYY)"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button type="button" className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button type="button" className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
              Work List
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="ml-auto flex items-center gap-1 border border-slate-200 rounded overflow-hidden">
              <button type="button" className="p-1.5 bg-blue-50 text-blue-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button type="button" className="p-1.5 text-slate-400 hover:bg-slate-50">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white">
            <div className="px-4 py-2 text-[11px] text-slate-500 border-b border-slate-100 sticky top-0 bg-white z-10">
              Rows: {filtered.length}
            </div>

            <table className="w-full text-xs">
              <thead className="sticky top-[33px] z-10 bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-600">
                  <th className="text-left font-medium px-4 py-2 w-[140px]">
                    Accession No
                    <FilterIcon />
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    Service
                    <FilterIcon />
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    Patient Name
                    <FilterIcon />
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    Account
                    <FilterIcon />
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    Provider
                    <FilterIcon />
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    Status
                    <FilterIcon />
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    Last Service Updated
                    <FilterIcon />
                  </th>
                  <th className="w-[200px] px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {grouped.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      No records in this category
                    </td>
                  </tr>
                ) : (
                  grouped.map(([date, rows]) => {
                    const collapsed = collapsedDates.has(date)
                    return (
                      <Fragment key={date}>
                        <tr className="bg-slate-50/80 border-b border-slate-100">
                          <td colSpan={8} className="px-4 py-1.5">
                            <button
                              type="button"
                              onClick={() => toggleDate(date)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
                            >
                              <svg
                                className={`w-3 h-3 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              {date} ({rows.length})
                            </button>
                          </td>
                        </tr>
                        {!collapsed && rows.map((entry) => (
                          <tr
                            key={entry.id}
                            className="border-b border-slate-100 hover:bg-blue-50/40 cursor-pointer"
                            onClick={() => onOpenReport?.(entry)}
                          >
                            <td className="px-4 py-2.5 align-top">
                              <div className="font-semibold text-slate-800">{entry.accessionNo}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {entry.tags.map((tag) => (
                                  <TagBadge key={tag.label} tag={tag} />
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-blue-600 font-medium align-top hover:underline">{entry.service}</td>
                            <td className="px-3 py-2.5 align-top">
                              <div className="font-semibold text-slate-800">{entry.patientName}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">{entry.patientMeta}</div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 align-top">{entry.account}</td>
                            <td className="px-3 py-2.5 text-slate-600 align-top">{entry.provider}</td>
                            <td className="px-3 py-2.5 align-top">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                                {entry.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 align-top whitespace-nowrap">{entry.lastUpdated}</td>
                            <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onOpenReport?.(entry)}
                                  className="px-2.5 py-1 border border-blue-500 text-blue-600 rounded text-[11px] font-medium hover:bg-blue-50 whitespace-nowrap"
                                >
                                  Preview {entry.previewCount}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onValidate?.(entry)}
                                  className="px-2.5 py-1 bg-blue-600 text-white rounded text-[11px] font-medium hover:bg-blue-700 whitespace-nowrap"
                                >
                                  Validate
                                </button>
                                <button type="button" className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  )
}
