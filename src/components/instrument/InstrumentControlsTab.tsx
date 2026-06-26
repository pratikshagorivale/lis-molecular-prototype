import { useState } from 'react'
import { Badge } from '../ui/Badge'
import { AddControlModal } from './AddControlModal'
import type { InstrumentControlConfig } from '../../types'

interface InstrumentControlsTabProps {
  controls: InstrumentControlConfig[]
  onAddControl: (control: InstrumentControlConfig) => void
  onUpdateControl: (control: InstrumentControlConfig) => void
  onDeleteControl: (controlId: string) => void
}

function scopeLabel(scope: InstrumentControlConfig['scope']) {
  return scope === 'plate' ? 'Plate Control' : 'Targeted Control'
}

function scopeVariant(scope: InstrumentControlConfig['scope']) {
  return scope === 'plate' ? 'neutral' as const : 'info' as const
}

function formatTargets(control: InstrumentControlConfig) {
  if (control.scope !== 'targeted' || !control.targets?.length) return '—'
  return control.targets.map((t) => t.target).join(', ')
}

function displayExpectedInterpretation(control: InstrumentControlConfig) {
  if (control.scope === 'plate') return control.status || '—'
  if (control.status) return control.status
  const targets = control.targets ?? []
  if (!targets.length) return '—'
  const statuses = [...new Set(targets.map((t) => t.status))]
  if (statuses.length === 1) return statuses[0]
  return targets.map((t) => `${t.target}: ${t.status}`).join('; ')
}

export function InstrumentControlsTab({ controls, onAddControl, onUpdateControl, onDeleteControl }: InstrumentControlsTabProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingControl, setEditingControl] = useState<InstrumentControlConfig | null>(null)

  const closeModal = () => {
    setModalOpen(false)
    setEditingControl(null)
  }

  const handleSave = (control: InstrumentControlConfig) => {
    if (editingControl) {
      onUpdateControl(control)
    } else {
      onAddControl(control)
    }
    closeModal()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditingControl(null)
            setModalOpen(true)
          }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
        >
          Add Control
        </button>
      </div>

      {controls.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-lg py-16 text-center">
          <p className="text-sm text-slate-500 mb-3">No controls configured for this instrument.</p>
          <button
            type="button"
            onClick={() => {
              setEditingControl(null)
              setModalOpen(true)
            }}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
          >
            Add New Control
          </button>
        </div>
      ) : (
        <div className="border border-slate-200 rounded overflow-hidden bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium">Control Type</th>
                <th className="px-3 py-2 text-left font-medium">Control name</th>
                <th className="px-3 py-2 text-left font-medium">Expected Interpretation</th>
                <th className="px-3 py-2 text-left font-medium">Targets</th>
                <th className="px-3 py-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {controls.map((control) => (
                <tr key={control.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800">{control.controlType}</span>
                      <Badge variant={scopeVariant(control.scope)}>{scopeLabel(control.scope)}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{control.control}</td>
                  <td className="px-3 py-2 text-slate-600">{displayExpectedInterpretation(control)}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[280px] truncate" title={formatTargets(control)}>
                    {formatTargets(control)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingControl(control)
                          setModalOpen(true)
                        }}
                        className="p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-blue-50"
                        aria-label={`Edit ${control.control}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteControl(control.id)}
                        className="p-1 text-red-500 hover:text-red-700 rounded hover:bg-red-50"
                        aria-label={`Delete ${control.control}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

      <AddControlModal
        open={modalOpen}
        editingControl={editingControl}
        onClose={closeModal}
        onSave={handleSave}
      />
    </div>
  )
}
