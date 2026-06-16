import { useState } from 'react'
import { instruments } from '../data/mockData'
import type { InstrumentCard } from '../types'

interface DeviceResultsValidationHomeProps {
  onUploadClick: () => void
  lastUploadedPlate?: string
  pendingValidation?: number
}

function InstrumentCardComponent({ card, onUpload }: { card: InstrumentCard; onUpload?: () => void }) {
  return (
    <div className={`bg-white border border-slate-200 rounded shadow-sm border-l-4 ${card.borderColor} flex flex-col`}>
      <div className="px-3 py-2 border-b border-slate-100 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{card.name}</h3>
          <p className="text-[11px] text-slate-500">{card.category}</p>
        </div>
        <button className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-50">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="px-3 py-1.5 text-[11px] text-slate-500 flex gap-4 border-b border-slate-50">
        <span>QC Last Sync: <span className="text-slate-700">{card.qcLastSync}</span></span>
        <span>Parameters Last Sync: <span className="text-slate-700">{card.paramsLastSync}</span></span>
      </div>

      {card.isMolecular && (
        <div className="px-3 py-1.5 text-[11px] text-slate-500 flex gap-4 border-b border-slate-50">
          <span>Last Uploaded Plate: <span className="text-blue-600 font-medium">{card.lastUploadedPlate}</span></span>
          <span>Pending Validation: <span className="text-amber-600 font-medium">{card.pendingValidation}</span></span>
        </div>
      )}

      <div className="px-3 py-2 flex-1 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600">QC</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${card.qcCount ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
            {card.qcCount ? `${card.qcCount} Results` : 'No Results'}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600">{card.category === 'Toxicology' ? 'Drugs / Parameters' : 'Parameters'}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${card.paramsCount ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
            {card.paramsCount ? `${card.paramsCount} Results` : 'No Results'}
          </span>
        </div>
      </div>

      {card.isMolecular && onUpload && (
        <div className="px-3 py-2 border-t border-slate-100">
          <button
            onClick={onUpload}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-blue-500 text-blue-600 rounded text-xs font-medium hover:bg-blue-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Results
          </button>
        </div>
      )}
    </div>
  )
}

export function DeviceResultsValidationHome({ onUploadClick, lastUploadedPlate, pendingValidation }: DeviceResultsValidationHomeProps) {
  const [search, setSearch] = useState('')
  const [resultFilter, setResultFilter] = useState('All Results')
  const [statusFilter, setStatusFilter] = useState('All')

  const filtered = instruments.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-slate-800">Device Results Validation</h1>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">File Upload</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <div className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded text-xs text-slate-600">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            May 31, 2026 - May 31, 2026
          </div>
          <button className="p-1.5 border border-slate-200 rounded text-slate-500 hover:bg-slate-50">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="px-4 py-2 flex items-center gap-3 border-b border-slate-200 bg-white">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search Instrument"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-12 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] bg-slate-100 text-slate-400 px-1 rounded">⌘J</span>
        </div>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white"
        >
          <option>All Results</option>
          <option>Pending</option>
          <option>Validated</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-600 bg-white"
        >
          <option>All</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} of {instruments.length} instruments</span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 flex-1 overflow-y-auto">
        {filtered.map((card) => (
          <InstrumentCardComponent
            key={card.id}
            card={{
              ...card,
              ...(card.isMolecular && lastUploadedPlate
                ? { lastUploadedPlate, pendingValidation: pendingValidation ?? card.pendingValidation }
                : {}),
            }}
            onUpload={card.isMolecular ? onUploadClick : undefined}
          />
        ))}
      </div>
    </div>
  )
}
