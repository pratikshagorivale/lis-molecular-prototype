import { useState } from 'react'
import { Modal } from './ui/Modal'
import type { CapaFormData, CapaStatus, PlateQcFailure } from '../types'

const STATUS_OPTIONS: CapaStatus[] = ['Open', 'In Progress', 'Closed']

const EMPTY_FORM: CapaFormData = {
  rootCause: '',
  correctiveAction: '',
  preventiveAction: '',
  status: 'Open',
}

/** Parent mounts this only while a CAPA is being raised, so the form resets on each open. */
interface CapaModalProps {
  plateId: string
  /** Controls that failed and have no CAPA yet — one CAPA is raised per control. */
  failures: PlateQcFailure[]
  /** Controls already answered by a CAPA, listed so it is clear what is covered. */
  coveredLabels?: string[]
  /** Shown when the modal was opened by a release / reject flow rather than from the plate drawer. */
  skipLabel?: string
  onClose: () => void
  onSkip?: () => void
  onSubmit: (form: CapaFormData, failure: PlateQcFailure) => void
}

export function CapaModal({
  plateId,
  failures,
  coveredLabels = [],
  skipLabel,
  onClose,
  onSkip,
  onSubmit,
}: CapaModalProps) {
  const [form, setForm] = useState<CapaFormData>(EMPTY_FORM)
  const [controlKey, setControlKey] = useState(failures[0]?.control ?? '')
  const selected = failures.find((f) => f.control === controlKey) ?? failures[0]

  const update = (patch: Partial<CapaFormData>) => setForm((prev) => ({ ...prev, ...patch }))

  // CAPA is never a gate — a completely blank form is still a valid record to file.
  const hasContent = Boolean(
    form.rootCause.trim() || form.correctiveAction.trim() || form.preventiveAction.trim(),
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={`Raise CAPA — Plate ${plateId}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">
            CAPA is optional. You can continue without recording one.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip ?? onClose}
              className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50"
            >
              {skipLabel ?? 'Cancel'}
            </button>
            <button
              onClick={() => selected && onSubmit(form, selected)}
              disabled={!hasContent || !selected}
              title={hasContent ? undefined : 'Fill at least one field to save a CAPA'}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save CAPA
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-3">
        {failures.length > 1 && (
          <label className="block">
            <span className="text-xs font-medium text-slate-700">This CAPA answers</span>
            <select
              value={controlKey}
              onChange={(e) => setControlKey(e.target.value as PlateQcFailure['control'])}
              className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {failures.map((failure) => (
                <option key={failure.control} value={failure.control}>{failure.label}</option>
              ))}
            </select>
            <span className="block text-[11px] text-slate-500 mt-1">
              {failures.length} controls still need a CAPA — raise one for each.
            </span>
          </label>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
            QC Failure{selected ? ` — ${selected.label}` : ''}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            {selected?.summary ?? 'QC failure recorded on this plate.'}
          </p>
        </div>

        {coveredLabels.length > 0 && (
          <p className="text-[11px] text-slate-500">
            Already covered by a CAPA: {coveredLabels.join(', ')}
          </p>
        )}

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Root Cause</span>
          <span className="text-[11px] text-slate-400 ml-1">(optional)</span>
          <textarea
            value={form.rootCause}
            onChange={(e) => update({ rootCause: e.target.value })}
            rows={2}
            placeholder="What caused the QC failure?"
            className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Corrective Action</span>
          <span className="text-[11px] text-slate-400 ml-1">(optional)</span>
          <textarea
            value={form.correctiveAction}
            onChange={(e) => update({ correctiveAction: e.target.value })}
            rows={2}
            placeholder="What was done to correct this run?"
            className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Preventive Action</span>
          <span className="text-[11px] text-slate-400 ml-1">(optional)</span>
          <textarea
            value={form.preventiveAction}
            onChange={(e) => update({ preventiveAction: e.target.value })}
            rows={2}
            placeholder="What will stop this recurring?"
            className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </label>

        <label className="block max-w-[200px]">
          <span className="text-xs font-medium text-slate-700">Status</span>
          <select
            value={form.status}
            onChange={(e) => update({ status: e.target.value as CapaStatus })}
            className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  )
}
