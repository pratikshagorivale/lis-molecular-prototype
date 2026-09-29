import { useMemo, useState } from 'react'
import type { ToxDrugCutOff } from '../../data/toxDrugs'

/**
 * The reporting cut-off for every drug on the instrument's panel.
 *
 * This is the one number that decides a patient result: at or above it the
 * drug reads Positive, below it Negative. Controls are judged separately, so
 * nothing configured on the Controls tab moves a patient result.
 */
export function ToxDrugsTab({
  drugs,
  unit = 'ng/mL',
  onChange,
}: {
  drugs: ToxDrugCutOff[]
  unit?: string
  onChange: (drugs: ToxDrugCutOff[]) => void
}) {
  const [search, setSearch] = useState('')

  const missing = useMemo(() => drugs.filter((d) => d.cutOff == null).length, [drugs])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? drugs.filter((d) => d.drug.toLowerCase().includes(q)) : drugs
  }, [drugs, search])

  const setCutOff = (drug: string, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw)
    onChange(drugs.map((d) => (
      d.drug === drug
        ? { ...d, cutOff: Number.isFinite(value as number) ? (value as number) : null }
        : d
    )))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-600 max-w-2xl">
          The concentration at or above which each drug reads positive. This decides the
          patient result — a drug with no cut-off cannot be reported and is voided on every
          run until one is set.
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search drugs"
          className="px-2.5 py-1.5 border border-slate-200 rounded text-xs w-44 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {missing > 0 && (
        <div className="flex gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded">
          <svg className="w-4 h-4 text-amber-600 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z" />
          </svg>
          <p className="text-[11px] text-amber-900">
            {missing} drug{missing === 1 ? '' : 's'} have no cut-off. Results for
            {missing === 1 ? ' it' : ' them'} cannot be released.
          </p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Drug</th>
              <th className="px-3 py-2 font-medium w-48">Reporting cut-off ({unit})</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((drug) => (
              <tr key={drug.drug} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-1.5 text-slate-800">
                  {drug.drug}
                  {drug.cutOff == null && (
                    <span className="ml-1.5 text-[10px] text-amber-700 font-medium">not set</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={drug.cutOff ?? ''}
                    onChange={(e) => setCutOff(drug.drug, e.target.value)}
                    placeholder="Not set"
                    aria-label={`Reporting cut-off for ${drug.drug}`}
                    className={`w-36 px-2 py-1 border rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      drug.cutOff == null ? 'border-amber-300' : 'border-slate-200'
                    }`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-slate-500">
            No drug matches “{search}”.
          </p>
        )}
      </div>
    </div>
  )
}
