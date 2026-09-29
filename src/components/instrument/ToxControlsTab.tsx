import { useState } from 'react'
import { Badge } from '../ui/Badge'
import { AddToxControlModal } from './AddToxControlModal'
import { interpretationForToxOperator, type ToxControlConfig } from '../../types/toxControl'

/**
 * The controls a toxicology instrument runs, and what the lab expects of them.
 *
 * The parser recognises a control by matching a position's sample name
 * against the Control column here, so these names must be exactly what the
 * instrument writes.
 */

const TYPE_VARIANT = {
  Calibrator: 'info',
  QC: 'control',
  Blank: 'neutral',
} as const

const FAILURE_LABEL = {
  'fail-drug': 'Voids that drug',
  'fail-plate': 'Fails the plate',
} as const

interface ToxControlsTabProps {
  controls: ToxControlConfig[]
  availableDrugs: string[]
  onChange: (controls: ToxControlConfig[]) => void
}

export function ToxControlsTab({ controls, availableDrugs, onChange }: ToxControlsTabProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ToxControlConfig | null>(null)

  const close = () => { setModalOpen(false); setEditing(null) }

  const save = (control: ToxControlConfig) => {
    onChange(editing
      ? controls.map((c) => (c.id === control.id ? control : c))
      : [...controls, control])
    close()
  }

  const cutOff = (control: ToxControlConfig) => {
    if (control.scope === 'targeted') {
      const drugs = control.drugs ?? []
      const set = drugs.filter((d) => d.cutOff)
      if (set.length === 0) return '—'
      return set.length === 1 ? set[0].cutOff : 'Per drug'
    }
    return control.cutOff || '—'
  }

  const applies = (control: ToxControlConfig) => {
    if (control.scope === 'panel') return 'Every drug'
    const drugs = control.drugs ?? []
    if (drugs.length === 0) return 'No drugs set'
    return drugs.map((d) => d.drug).join(', ')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-600 max-w-xl">
          The parser reads the file; these say what the lab expects of it. A control is recognised
          by matching the position&apos;s sample name against the <strong>Control</strong> column,
          so the names must be exactly what the instrument writes.
        </p>
        <button
          type="button"
          onClick={() => { setEditing(null); setModalOpen(true) }}
          className="shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
        >
          Add Control
        </button>
      </div>

      {controls.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-lg py-12 text-center">
          <p className="text-sm text-slate-600">No controls configured.</p>
          <p className="text-xs text-slate-500 mt-1">
            Without them a run has no calibration curve and no QC, so nothing can be released.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="px-3 py-2 font-medium">Control</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Applies to</th>
                <th className="px-3 py-2 font-medium">Cut-off</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">On failure</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((control) => (
                <tr key={control.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-slate-800">{control.control}</td>
                  <td className="px-3 py-2">
                    <Badge variant={TYPE_VARIANT[control.controlType]}>{control.controlType}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{control.level ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[220px] truncate" title={applies(control)}>
                    {applies(control)}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {control.operator} {cutOff(control)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      interpretationForToxOperator(control.operator) === 'Positive'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {interpretationForToxOperator(control.operator)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{FAILURE_LABEL[control.failureBehavior]}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => { setEditing(control); setModalOpen(true) }}
                      className="text-blue-600 hover:text-blue-800 font-medium mr-3"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(controls.filter((c) => c.id !== control.id))}
                      className="text-slate-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddToxControlModal
        open={modalOpen}
        onClose={close}
        onSave={save}
        editing={editing}
        availableDrugs={availableDrugs}
      />
    </div>
  )
}
