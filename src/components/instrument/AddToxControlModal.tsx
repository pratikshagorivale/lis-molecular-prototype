import { useState } from 'react'
import { Modal } from '../ui/Modal'
import {
  TOX_CONTROL_TYPES,
  TOX_CUT_OFF_OPERATORS,
  interpretationForToxOperator,
  type ToxCutOffOperator,
  type ToxControlConfig,
  type ToxControlFormData,
  type ToxControlScope,
  type ToxControlType,
  type ToxDrugExpectation,
} from '../../types/toxControl'

/**
 * Define one control the way the lab runs it.
 *
 * `control` is the name the instrument writes in the file — matching it is how
 * a position is recognised as this control, so it has to be exact. The
 * cut-offs are lab knowledge the parser cannot infer.
 */

const emptyForm: ToxControlFormData = {
  controlType: 'Calibrator',
  control: '',
  level: '',
  scope: 'panel',
  operator: '>=',
  cutOff: '',
  drugs: [],
  failureBehavior: 'fail-drug',
}

const inputClass =
  'w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

interface AddToxControlModalProps {
  open: boolean
  onClose: () => void
  onSave: (control: ToxControlConfig) => void
  editing: ToxControlConfig | null
  /** Drugs on this instrument's panel, for the targeted rows. */
  availableDrugs: string[]
}

export function AddToxControlModal({
  open,
  onClose,
  onSave,
  editing,
  availableDrugs,
}: AddToxControlModalProps) {
  const [form, setForm] = useState<ToxControlFormData>(emptyForm)
  const [lastEditing, setLastEditing] = useState<ToxControlConfig | null | undefined>(undefined)

  // Adjusted during render rather than in an effect, so opening the modal on a
  // control shows that control and not the previous one.
  if (editing !== lastEditing) {
    setLastEditing(editing)
    setForm(editing
      ? {
          controlType: editing.controlType,
          control: editing.control,
          level: editing.level ?? '',
          scope: editing.scope,
          operator: editing.operator,
          cutOff: editing.cutOff ?? '',
          drugs: editing.drugs ?? [],
          failureBehavior: editing.failureBehavior,
        }
      : emptyForm)
  }

  const set = (patch: Partial<ToxControlFormData>) => setForm((prev) => ({ ...prev, ...patch }))

  const addDrug = () => set({
    drugs: [...form.drugs, {
      id: crypto.randomUUID(),
      drug: availableDrugs[0] ?? '',
      cutOff: '',
    }],
  })

  const updateDrug = (id: string, patch: Partial<ToxDrugExpectation>) => set({
    drugs: form.drugs.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  })

  const removeDrug = (id: string) => set({ drugs: form.drugs.filter((d) => d.id !== id) })

  const expected = interpretationForToxOperator(form.operator)

  const canSave = form.control.trim().length > 0
    && (form.scope === 'panel' || form.drugs.some((d) => d.drug))

  const handleSave = () => {
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      controlType: form.controlType,
      control: form.control.trim(),
      level: form.controlType === 'Calibrator' ? form.level.trim() || undefined : undefined,
      scope: form.scope,
      operator: form.operator,
      cutOff: form.scope === 'panel' ? form.cutOff.trim() || undefined : undefined,
      drugs: form.scope === 'targeted' ? form.drugs.filter((d) => d.drug) : undefined,
      failureBehavior: form.failureBehavior,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Control' : 'Add Control'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {editing ? 'Save Control' : 'Add Control'}
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Control Type">
            <select
              value={form.controlType}
              onChange={(e) => set({ controlType: e.target.value as ToxControlType })}
              className={inputClass}
            >
              {TOX_CONTROL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Control Name" hint="Exactly as the instrument writes it">
            <input
              type="text"
              value={form.control}
              onChange={(e) => set({ control: e.target.value })}
              placeholder="L1, QC L, QC N"
              className={inputClass}
            />
          </Field>

          {form.controlType === 'Calibrator' ? (
            <Field label="Level" hint="Orders the calibration curve">
              <input
                type="number"
                min={1}
                value={form.level}
                onChange={(e) => set({ level: e.target.value })}
                className={inputClass}
              />
            </Field>
          ) : <div />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Applies to">
            <select
              value={form.scope}
              onChange={(e) => set({ scope: e.target.value as ToxControlScope })}
              className={inputClass}
            >
              <option value="panel">Every drug on the panel</option>
              <option value="targeted">Named drugs only</option>
            </select>
          </Field>

          <Field label="Expected result" hint="Which side of the cut-off this control should land on">
            <select
              value={form.operator}
              onChange={(e) => set({ operator: e.target.value as ToxCutOffOperator })}
              className={inputClass}
            >
              {TOX_CUT_OFF_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>

          {form.scope === 'panel' && (
            <Field label="Cut-off" hint="Applies to every drug on the panel">
              <input
                type="text"
                value={form.cutOff}
                onChange={(e) => set({ cutOff: e.target.value })}
                placeholder="ng/mL"
                className={inputClass}
              />
            </Field>
          )}
        </div>

        {/* The expected interpretation is not a choice — it follows from the
            comparison, and is what every drug on this control is checked against. */}
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded">
          <span className="text-xs text-slate-600">Expected interpretation</span>
          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
            expected === 'Positive'
              ? 'bg-red-100 text-red-800'
              : 'bg-slate-200 text-slate-700'
          }`}>
            {expected}
          </span>
          <span className="text-[11px] text-slate-500">
            {form.cutOff.trim() || form.scope === 'targeted'
              ? `Every drug must read ${form.operator} its cut-off`
              : 'Enter a cut-off to complete the rule'}
          </span>
        </div>

        {form.scope === 'targeted' && (
          <div className="border border-slate-200 rounded">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-semibold text-slate-700">Drugs</span>
              <button
                type="button"
                onClick={addDrug}
                className="px-2 py-1 border border-blue-500 text-blue-600 rounded text-[11px] font-medium hover:bg-blue-50"
              >
                + Add drug
              </button>
            </div>
            {form.drugs.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-slate-500">
                No drugs added. This control will not be evaluated until at least one is.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-3 py-1.5 font-medium">Drug</th>
                    <th className="px-3 py-1.5 font-medium">Cut-off</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {form.drugs.map((drug) => (
                    <tr key={drug.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-1.5">
                        <select
                          value={drug.drug}
                          onChange={(e) => updateDrug(drug.id, { drug: e.target.value })}
                          className={inputClass}
                        >
                          <option value="">— Select drug —</option>
                          {availableDrugs.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={drug.cutOff}
                          onChange={(e) => updateDrug(drug.id, { cutOff: e.target.value })}
                          placeholder="ng/mL"
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeDrug(drug.id)}
                          className="text-slate-400 hover:text-red-600"
                          aria-label={`Remove ${drug.drug || 'drug'}`}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <Field label="When this control fails" hint="How far the failure reaches">
          <select
            value={form.failureBehavior}
            onChange={(e) => set({ failureBehavior: e.target.value as ToxControlFormData['failureBehavior'] })}
            className={inputClass}
          >
            <option value="fail-drug">Void that drug across the plate</option>
            <option value="fail-plate">Fail the whole plate</option>
          </select>
        </Field>
      </div>
    </Modal>
  )
}
