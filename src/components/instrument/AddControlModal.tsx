import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { AVAILABLE_TARGETS } from '../../data/instrumentManagementMockData'
import { getTargetCtCutOff } from '../../data/targetMaster'
import type {
  AddControlFormData,
  AmpStatusOption,
  ControlScope,
  ControlTypeOption,
  InstrumentControlConfig,
  PlateFailureBehavior,
  TargetedControlTarget,
  TargetedFailureBehavior,
} from '../../types'

const CONTROL_TYPES: ControlTypeOption[] = [
  'Positive Control',
  'Negative Control',
  'NTC',
  'Internal Control',
  'Extraction Control',
]

const AMP_STATUSES: AmpStatusOption[] = ['Detected', 'Not Detected', 'Inconclusive']

const emptyForm = (): AddControlFormData => ({
  controlType: 'Positive Control',
  control: '',
  scope: 'plate',
  expectedResultCtCutOff: '',
  status: 'Detected',
  targets: [],
  plateFailureBehavior: 'fail-plate',
  targetedFailureBehavior: 'fail-plate',
})

function controlToForm(control: InstrumentControlConfig): AddControlFormData {
  return {
    controlType: control.controlType,
    control: control.control,
    scope: control.scope,
    expectedResultCtCutOff: control.expectedResultCtCutOff ?? '',
    status: control.status ?? 'Detected',
    targets: (control.targets ?? []).map((target) => ({
      ...target,
      ctCutOff: getTargetCtCutOff(target.target),
      status: target.status ?? 'Detected',
    })),
    plateFailureBehavior: control.plateFailureBehavior ?? 'fail-plate',
    targetedFailureBehavior: control.targetedFailureBehavior ?? 'fail-plate',
  }
}

interface AddControlModalProps {
  open: boolean
  editingControl?: InstrumentControlConfig | null
  onClose: () => void
  onSave: (control: InstrumentControlConfig) => void
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-slate-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

export function AddControlModal({ open, editingControl, onClose, onSave }: AddControlModalProps) {
  const [form, setForm] = useState<AddControlFormData>(emptyForm)
  const [targetSearch, setTargetSearch] = useState('')
  const isEditing = Boolean(editingControl)

  useEffect(() => {
    if (open) {
      setForm(editingControl ? controlToForm(editingControl) : emptyForm())
      setTargetSearch('')
    }
  }, [open, editingControl])

  const filteredTargets = useMemo(() => {
    const q = targetSearch.trim().toLowerCase()
    const selected = new Set(form.targets.map((t) => t.target))
    return AVAILABLE_TARGETS.filter((target) => {
      if (selected.has(target)) return false
      if (!q) return true
      return target.toLowerCase().includes(q)
    })
  }, [form.targets, targetSearch])

  const addTarget = (target: string) => {
    setForm((prev) => ({
      ...prev,
      targets: [
        ...prev.targets,
        { id: crypto.randomUUID(), target, ctCutOff: getTargetCtCutOff(target), status: 'Detected' },
      ],
    }))
    setTargetSearch('')
  }

  const updateTarget = (id: string, patch: Partial<TargetedControlTarget>) => {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }))
  }

  const removeTarget = (id: string) => {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.filter((row) => row.id !== id),
    }))
  }

  const handleSave = () => {
    if (!form.control.trim()) return
    if (form.scope === 'targeted' && form.targets.length === 0) return

    onSave({
      id: editingControl?.id ?? crypto.randomUUID(),
      controlType: form.controlType,
      control: form.control.trim(),
      scope: form.scope,
      expectedResultCtCutOff: form.scope === 'plate' ? form.expectedResultCtCutOff : undefined,
      status: form.scope === 'plate' ? form.status : undefined,
      targets: form.scope === 'targeted'
        ? form.targets.map((target) => ({
            ...target,
            ctCutOff: getTargetCtCutOff(target.target),
          }))
        : undefined,
      plateFailureBehavior: form.scope === 'plate' ? form.plateFailureBehavior : undefined,
      targetedFailureBehavior: form.scope === 'targeted' ? form.targetedFailureBehavior : undefined,
    })
    onClose()
  }

  const canSave =
    form.control.trim() &&
    (form.scope === 'plate'
      ? Boolean(form.status)
      : form.targets.length > 0 && form.targets.every((target) => Boolean(target.status)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit control' : 'Add new control'}
      size="lg"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-1.5 bg-violet-600 text-white rounded text-xs font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEditing ? 'Save Changes' : 'Add Control'}
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Control Type</FieldLabel>
            <select
              value={form.controlType}
              onChange={(e) => setForm((prev) => ({ ...prev, controlType: e.target.value as ControlTypeOption }))}
              className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700"
            >
              {CONTROL_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Control name</FieldLabel>
            <input
              type="text"
              value={form.control}
              onChange={(e) => setForm((prev) => ({ ...prev, control: e.target.value }))}
              placeholder="e.g. PC, NC, NTC"
              className="w-full px-2 py-1.5 border border-slate-200 rounded text-slate-700"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Control Scope</FieldLabel>
          <div className="flex items-center gap-6 mt-1">
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={form.scope === 'plate'}
                onChange={() => setForm((prev) => ({ ...prev, scope: 'plate' as ControlScope }))}
                className="text-violet-600"
              />
              Plate Control
            </label>
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={form.scope === 'targeted'}
                onChange={() => setForm((prev) => ({ ...prev, scope: 'targeted' as ControlScope }))}
                className="text-violet-600"
              />
              Targeted Control
            </label>
          </div>
        </div>

        {form.scope === 'plate' ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Expected Result value (CT Cut Off)</FieldLabel>
                <input
                  type="text"
                  value={form.expectedResultCtCutOff}
                  onChange={(e) => setForm((prev) => ({ ...prev, expectedResultCtCutOff: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-slate-700"
                />
              </div>
              <div>
                <FieldLabel required>Expected Interpretation</FieldLabel>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as AmpStatusOption }))}
                  required
                  className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700"
                >
                  {AMP_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <FieldLabel>Failure Behavior</FieldLabel>
              <div className="flex items-center gap-6 mt-1">
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="plateFailure"
                    checked={form.plateFailureBehavior === 'fail-plate'}
                    onChange={() => setForm((prev) => ({ ...prev, plateFailureBehavior: 'fail-plate' as PlateFailureBehavior }))}
                    className="text-violet-600"
                  />
                  Fail Entire Plate
                </label>
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="plateFailure"
                    checked={form.plateFailureBehavior === 'warning-only'}
                    onChange={() => setForm((prev) => ({ ...prev, plateFailureBehavior: 'warning-only' as PlateFailureBehavior }))}
                    className="text-violet-600"
                  />
                  Warning Only
                </label>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <FieldLabel>Add Targets</FieldLabel>
              <div className="relative">
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  placeholder="Search Targets"
                  className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded text-slate-700"
                />
              </div>
              {targetSearch && filteredTargets.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded bg-white max-h-28 overflow-y-auto">
                  {filteredTargets.map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => addTarget(target)}
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50 text-slate-700 border-b border-slate-100 last:border-b-0"
                    >
                      {target}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700 text-white">
                    <th className="px-2 py-1.5 text-left font-medium">Target</th>
                    <th className="px-2 py-1.5 text-left font-medium">CT (CutOff)</th>
                    <th className="px-2 py-1.5 text-left font-medium">Expected Interpretation *</th>
                    <th className="px-2 py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {form.targets.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-center text-slate-400">Search and add targets above</td>
                    </tr>
                  ) : (
                    form.targets.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-700">{row.target}</td>
                        <td className="px-2 py-1.5 text-slate-600">{getTargetCtCutOff(row.target)}</td>
                        <td className="px-2 py-1.5">
                          <select
                            value={row.status}
                            onChange={(e) => updateTarget(row.id, { status: e.target.value as AmpStatusOption })}
                            required
                            className="w-full px-1.5 py-1 border border-slate-200 rounded bg-white"
                          >
                            {AMP_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <button type="button" onClick={() => removeTarget(row.id)} className="text-red-500 hover:text-red-700">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <FieldLabel>Failure Behavior</FieldLabel>
              <div className="flex flex-wrap items-center gap-6 mt-1">
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="targetedFailure"
                    checked={form.targetedFailureBehavior === 'fail-plate'}
                    onChange={() => setForm((prev) => ({ ...prev, targetedFailureBehavior: 'fail-plate' as TargetedFailureBehavior }))}
                    className="text-violet-600"
                  />
                  Fail Entire Plate
                </label>
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="targetedFailure"
                    checked={form.targetedFailureBehavior === 'fail-target'}
                    onChange={() => setForm((prev) => ({ ...prev, targetedFailureBehavior: 'fail-target' as TargetedFailureBehavior }))}
                    className="text-violet-600"
                  />
                  Fail Affected Target
                </label>
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="targetedFailure"
                    checked={form.targetedFailureBehavior === 'warning-only'}
                    onChange={() => setForm((prev) => ({ ...prev, targetedFailureBehavior: 'warning-only' as TargetedFailureBehavior }))}
                    className="text-violet-600"
                  />
                  Warning Only
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
