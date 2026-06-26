import { useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { InstrumentControlsTab } from '../components/instrument/InstrumentControlsTab'
import type { InstrumentControlConfig, InstrumentDetailTab, ManagedInstrument } from '../types'

const MOLECULAR_TABS: { id: InstrumentDetailTab; label: string }[] = [
  { id: 'tests', label: 'Tests' },
  { id: 'organism', label: 'Organism' },
  { id: 'genes', label: 'Genes' },
  { id: 'unmapped-keys', label: 'Unmapped Keys' },
  { id: 'reagent', label: 'Reagent' },
  { id: 'controls', label: 'Controls' },
]

const DEFAULT_TABS: { id: InstrumentDetailTab; label: string }[] = [
  { id: 'tests', label: 'Tests' },
  { id: 'controls', label: 'Controls' },
]

interface InstrumentDetailPageProps {
  instrument: ManagedInstrument
  onBack: () => void
  onUpdateControls: (controls: InstrumentControlConfig[]) => void
}

function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-slate-200 rounded-lg py-16 text-center text-sm text-slate-500">
      {label} configuration will be available in a future update.
    </div>
  )
}

export function InstrumentDetailPage({ instrument, onBack, onUpdateControls }: InstrumentDetailPageProps) {
  const tabs = instrument.isMolecular ? MOLECULAR_TABS : DEFAULT_TABS
  const [activeTab, setActiveTab] = useState<InstrumentDetailTab>('controls')

  const addControl = (control: InstrumentControlConfig) => {
    onUpdateControls([...instrument.controls, control])
  }

  const updateControl = (control: InstrumentControlConfig) => {
    onUpdateControls(instrument.controls.map((c) => (c.id === control.id ? control : c)))
  }

  const deleteControl = (controlId: string) => {
    onUpdateControls(instrument.controls.filter((c) => c.id !== controlId))
  }

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-2">
          <button type="button" onClick={onBack} className="hover:text-blue-600">Instrument Management</button>
          <span>/</span>
          <span className="text-slate-700 font-medium">{instrument.instrumentType}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-slate-800">{instrument.name}</h1>
              <Badge variant={instrument.connectionStatus === 'Connected' ? 'success' : 'error'}>
                {instrument.connectionStatus}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="font-mono">{instrument.authKey}</span>
              <button type="button" className="text-blue-600 hover:underline">Copy</button>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" className="px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">Export</button>
            <button type="button" className="px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">Clear</button>
          </div>
        </div>

        <div className="flex gap-4 mt-4 border-b border-slate-200 -mb-px">
          {tabs.map((tab) => (
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

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
        {activeTab === 'controls' ? (
          <InstrumentControlsTab
            controls={instrument.controls}
            onAddControl={addControl}
            onUpdateControl={updateControl}
            onDeleteControl={deleteControl}
          />
        ) : (
          <TabPlaceholder label={tabs.find((t) => t.id === activeTab)?.label ?? 'This'} />
        )}
      </div>
    </div>
  )
}
