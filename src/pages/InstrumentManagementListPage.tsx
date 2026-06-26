import { useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import type { ManagedInstrument } from '../types'

interface InstrumentManagementListPageProps {
  instruments: ManagedInstrument[]
  onSelectInstrument: (instrumentId: string) => void
}

function ConnectionBadge({ status }: { status: ManagedInstrument['connectionStatus'] }) {
  return (
    <Badge variant={status === 'Connected' ? 'success' : 'error'}>
      {status}
    </Badge>
  )
}

function copyAuthKey(key: string) {
  void navigator.clipboard.writeText(key)
}

export function InstrumentManagementListPage({ instruments, onSelectInstrument }: InstrumentManagementListPageProps) {
  const [activeTab, setActiveTab] = useState<'instruments' | 'unmapped-keys'>('instruments')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return instruments.filter((instrument) => {
      if (!q) return true
      return instrument.name.toLowerCase().includes(q)
        || instrument.instrumentType.toLowerCase().includes(q)
    })
  }, [instruments, search])

  const enabled = filtered.filter((i) => i.enabled)
  const disabled = filtered.filter((i) => !i.enabled)

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-slate-800">Instruments</h1>
          <div className="flex items-center gap-2">
            <button type="button" className="text-xs text-blue-600 hover:underline">Download Interfacing App</button>
            <button type="button" className="px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">Export</button>
          </div>
        </div>

        <div className="flex gap-4 mt-3 border-b border-slate-200 -mb-px">
          {[
            { id: 'instruments' as const, label: 'Instruments' },
            { id: 'unmapped-keys' as const, label: 'Unmapped Keys' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'unmapped-keys' ? (
        <div className="flex-1 p-4">
          <div className="border border-dashed border-slate-200 rounded-lg py-16 text-center text-sm text-slate-500">
            Unmapped keys configuration will be available in a future update.
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search instruments"
              className="px-2 py-1.5 border border-slate-200 rounded text-xs w-56"
            />
          </div>

          <p className="text-xs text-slate-500 mb-3">Rows: {filtered.length}</p>

          <InstrumentGroup
            title={`Enabled Instruments (${enabled.length})`}
            instruments={enabled}
            onSelectInstrument={onSelectInstrument}
          />
          {disabled.length > 0 && (
            <InstrumentGroup
              title={`Disabled Instruments (${disabled.length})`}
              instruments={disabled}
              onSelectInstrument={onSelectInstrument}
            />
          )}
        </div>
      )}
    </div>
  )
}

function InstrumentGroup({
  title,
  instruments,
  onSelectInstrument,
}: {
  title: string
  instruments: ManagedInstrument[]
  onSelectInstrument: (instrumentId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (instruments.length === 0) return null

  return (
    <div className="mb-4 border border-slate-200 rounded bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-left"
      >
        <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-semibold text-slate-700">{title}</span>
      </button>

      {!collapsed && (
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white text-slate-500 border-b border-slate-100">
              <th className="px-3 py-2 text-left font-medium">Name of instrument</th>
              <th className="px-3 py-2 text-left font-medium">Connection Status</th>
              <th className="px-3 py-2 text-left font-medium">Instrument Type</th>
              <th className="px-3 py-2 text-left font-medium">Instrument Auth</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((instrument) => (
              <tr key={instrument.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectInstrument(instrument.id)}
                    className="font-medium text-blue-600 hover:underline text-left"
                  >
                    {instrument.name}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <ConnectionBadge status={instrument.connectionStatus} />
                </td>
                <td className="px-3 py-2 text-slate-700">{instrument.instrumentType}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-600 truncate max-w-[220px]" title={instrument.authKey}>
                      {instrument.authKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyAuthKey(instrument.authKey)}
                      className="text-slate-400 hover:text-slate-600"
                      aria-label="Copy auth key"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectInstrument(instrument.id)}
                    className="px-2 py-1 border border-slate-200 rounded text-[11px] text-slate-600 hover:bg-white"
                  >
                    Edit Settings
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
