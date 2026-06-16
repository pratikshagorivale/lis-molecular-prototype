import { useMemo, useState } from 'react'
import { buildMolecularReport } from '../data/reportEntryMockData'
import type { MolecularReportData, ReportResultRow, WaitingListEntry } from '../types'

interface MolecularReportEntryPageProps {
  entry: WaitingListEntry
  queue: WaitingListEntry[]
  reportOverride?: MolecularReportData | null
  onBack: () => void
  onSelectEntry: (entry: WaitingListEntry) => void
}

function ResultInput({ value, className = '' }: { value: string; className?: string }) {
  return (
    <input
      type="text"
      defaultValue={value}
      className={`w-full min-w-[80px] px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
    />
  )
}

function SectionTable({
  title,
  actionLabel,
  extraAction,
  columns,
  rows,
  renderCells,
}: {
  title: string
  actionLabel?: string
  extraAction?: React.ReactNode
  columns: string[]
  rows: ReportResultRow[]
  renderCells: (row: ReportResultRow) => React.ReactNode[]
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white mb-3">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen(!open)} className="text-slate-500">
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {extraAction}
          {actionLabel && (
            <button type="button" className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
              {actionLabel}
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white border-b border-slate-100 text-slate-500">
                {columns.map((col) => (
                  <th key={col} className="text-left font-medium px-3 py-2 whitespace-nowrap">{col}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  {renderCells(row).map((cell, i) => (
                    <td key={i} className="px-3 py-1.5">{cell}</td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button type="button" className="text-slate-300 hover:text-red-500 text-sm">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function MolecularReportEntryPage({ entry, queue, reportOverride, onBack, onSelectEntry }: MolecularReportEntryPageProps) {
  const [search, setSearch] = useState('')
  const report = useMemo(
    () => reportOverride ?? buildMolecularReport(entry),
    [entry, reportOverride],
  )

  const filteredQueue = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return queue
    return queue.filter(
      (e) =>
        e.patientName.toLowerCase().includes(q)
        || e.sampleId.toLowerCase().includes(q)
        || e.accessionNo.toLowerCase().includes(q),
    )
  }, [queue, search])

  return (
    <div className="h-full flex min-h-0 bg-slate-100">
      <aside className="w-[220px] bg-[#1e293b] text-slate-300 flex flex-col shrink-0 border-r border-slate-700">
        <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-slate-300 hover:text-white">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="text-[10px] text-slate-500">Critical(0)</span>
        </div>
        <div className="p-2 border-b border-slate-700">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Name, Sample ID, Bill ID"
            className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredQueue.map((item) => {
            const active = item.id === entry.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectEntry(item)}
                className={`w-full text-left rounded px-2 py-2 transition-colors ${
                  active ? 'bg-blue-600/30 border border-blue-500/50' : 'hover:bg-slate-700/50 border border-transparent'
                }`}
              >
                <div className={`text-[11px] font-medium truncate ${active ? 'text-white' : 'text-slate-200'}`}>
                  {item.patientName} ({item.patientMeta.replace('Female', 'F').replace('Male', 'M')})
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">Molecular reporting</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{item.sampleId}</div>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-slate-800">{report.reportTitle}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {report.status}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>Advance Editor</span>
              <button type="button" className="w-8 h-4 rounded-full bg-slate-200 relative">
                <span className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white shadow" />
              </button>
            </label>
            <button type="button" className="p-1.5 border border-slate-200 rounded text-slate-500 hover:bg-slate-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            <SectionTable
              title="Gene"
              actionLabel="Add Genes ▾"
              columns={['Name', 'Cut Off', 'Result', 'Interpretation']}
              rows={report.genes}
              renderCells={(row) => [
                <span key="n" className="text-slate-800">{row.name}</span>,
                <span key="c" className="text-slate-600">{row.cutOff}</span>,
                <ResultInput key="r" value={row.result} />,
                <ResultInput key="i" value={row.interpretation} />,
              ]}
            />

            <SectionTable
              title="Organism"
              actionLabel="Add Organisms ▾"
              columns={['Name', 'Result', 'Interpretation', 'Cut Off', 'Viral Load']}
              rows={report.organisms}
              renderCells={(row) => [
                <span key="n" className="text-slate-800">{row.name}</span>,
                <ResultInput key="r" value={row.result} />,
                <ResultInput key="i" value={row.interpretation} />,
                <span key="c" className="text-slate-600">{row.cutOff}</span>,
                <ResultInput key="v" value={row.viralLoad ?? ''} />,
              ]}
            />

            <SectionTable
              title="Antibiotic Resistance"
              extraAction={
                <button type="button" className="text-xs text-blue-600 hover:underline">Calculate</button>
              }
              columns={['Name', 'Cut Off', 'Result', 'Interpretation', 'Antibiotic Name']}
              rows={report.antibioticResistance}
              renderCells={(row) => [
                <span key="n" className="text-slate-800">{row.name}</span>,
                <span key="c" className="text-slate-600">{row.cutOff}</span>,
                <ResultInput key="r" value={row.result} className={row.result === '-' ? 'text-red-500' : ''} />,
                <ResultInput key="i" value={row.interpretation} />,
                <span key="a" className="text-slate-700">{row.antibioticName}</span>,
              ]}
            />

            <div className="border border-slate-200 rounded-lg bg-white p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Select Signing Doctor</span>
                <button type="button" className="text-[11px] text-blue-600 hover:underline">Clear Passkey</button>
              </div>
              <div className="text-xs text-slate-500 mb-3">Notify &amp; Assign</div>
              <button type="button" className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 hover:bg-slate-50">
                Find Doctor ▾
              </button>
            </div>
          </div>

          <aside className="w-[280px] bg-white border-l border-slate-200 shrink-0 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 leading-snug">
                    Ms. {report.patientName} ({report.patientMeta})
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1">{report.patientRef}</p>
                </div>
                <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-600 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button type="button" className="flex items-center gap-1 px-2 py-1 border border-slate-200 rounded text-[11px] text-slate-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  4
                </button>
                <button type="button" className="px-2 py-1 border border-slate-200 rounded text-[11px] text-slate-600">
                  Overview
                </button>
              </div>
            </div>
            <dl className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 text-xs">
              {([
                ['Accession Date', report.accessionDate],
                ['Bill Date', report.billDate],
                ['Billed By', report.billedBy],
                ['Bill ID', report.billId],
                ['Sample ID', report.sampleId],
                ['Order No', report.orderNo],
                ['Organization', report.organization],
                ['Referral Name', report.referralName],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-slate-800 font-medium mt-0.5 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>

        <footer className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-end gap-2 shrink-0">
          <button type="button" className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
            Edit Report
            <span className="ml-1 text-[10px] text-slate-400">⌘⇧↵</span>
          </button>
          <button type="button" className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
            Save And Sign
            <span className="ml-1 text-[10px] text-blue-200">⇧↵</span>
          </button>
          <button type="button" className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
            Save
            <span className="ml-1 text-[10px] text-blue-200">⌘↵</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
