import { Fragment, useState } from 'react'
import { Badge } from '../ui/Badge'
import { AssayBadge } from './AssayBadge'
import { formatConcentration, isPositionInvalid } from '../../utils/toxEvaluation'
import { consistencyFor, interpretationFor } from '../../utils/toxConsistency'
import type { ToxHistoryEntry, ToxOrderContext } from '../../data/toxOrderContext'
import type {
  BatchPosition,
  CompoundResult,
  ControlOutcome,
  ToxBatch,
} from '../../types/tox'

/** What the vendor's short codes mean, for the badge's tooltip. */
const TOX_FLAG_LABELS: Record<string, string> = {
  SN: 'Signal-to-noise below threshold',
  IR: 'Ion ratio outside tolerance',
  'RRT%': 'Relative retention time outside tolerance',
  AC: 'Accuracy outside tolerance',
  Outlier: 'Flagged as an outlier by the instrument',
}

function interpretationClass(result: CompoundResult): string {
  return interpretationFor(result) === 'Positive'
    ? 'text-red-700 font-medium'
    : 'text-slate-500'
}

export function ToxPositionPanel({
  position,
  batch,
  orderContext,
  onClose,
}: {
  position: BatchPosition
  batch: ToxBatch
  orderContext?: ToxOrderContext
  onClose: () => void
}) {
  const [showAll, setShowAll] = useState(true)
  const [extrasFor, setExtrasFor] = useState<string | null>(null)

  const isControl = position.type !== 'Sample'
  // A control's verdict is the one the configured control produced, not
  // anything re-derived here.
  const outcome = batch.controlOutcomes.find((o) => o.positionId === position.positionId) ?? null
  const controlFailed = (result: CompoundResult) => outcome?.failedCompounds.includes(result.compound) ?? false

  // A control's interesting rows are the ones that missed their cut-off; a
  // sample's are the ones that reached theirs.
  // Only render a mapped column when the parser found data for it: Agilent
  // carries no ion ratio, Shimadzu no per-row accuracy on samples.
  const has = (pick: (r: CompoundResult) => unknown) =>
    position.results.some((r) => {
      const value = pick(r)
      return value !== null && value !== undefined && value !== ''
    })
  const columns = {
    cutOff: !isControl && has((r) => r.cutOff),
    accuracy: has((r) => r.accuracy),
    retentionTime: has((r) => r.retentionTime),
    ionRatio: has((r) => r.ionRatio),
    signalToNoise: has((r) => r.signalToNoise),
    istdArea: has((r) => r.istdArea),
  }

  const failedCount = position.results.filter(controlFailed).length
  const prescribed = orderContext?.prescribed ?? []

  const shown = showAll
    ? position.results
    : isControl
      ? position.results.filter(controlFailed)
      // Narrowing goes to what disagrees with the prescription — the same set
      // the well card counts — not to every positive.
      : position.results.filter(
          (r) => consistencyFor(r, prescribed).consistency === 'Inconsistent')

  const stateBadge = isControl
    ? outcome && !outcome.passed
      ? { variant: 'error' as const, label: 'Failed' }
      : { variant: 'success' as const, label: 'Passed' }
    : isPositionInvalid(position, batch)
      ? { variant: 'error' as const, label: 'Invalid' }
      : { variant: 'success' as const, label: 'Valid' }

  return (
    <aside className="w-[560px] shrink-0 min-h-0 bg-white border-l border-slate-200 shadow-[-6px_0_16px_rgba(15,23,42,0.06)] flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">
            {position.positionId}
          </h2>
          <Badge variant={stateBadge.variant} size="md">{stateBadge.label}</Badge>
          {/* Vendor flags on the position, beside the verdict they qualify. */}
          {position.flags.map((flag) => (
            <span
              key={flag}
              title={TOX_FLAG_LABELS[flag] ?? `Instrument flag ${flag}`}
              className="px-1.5 py-0.5 rounded bg-orange-300 text-black text-[10px] font-semibold shrink-0"
            >
              {flag}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-white shrink-0"
          aria-label="Close position details"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4">
        <div className="space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <Field label="Sample ID" value={position.sampleId} />
          {orderContext && <Field label="Sample Type" value={orderContext.sampleType} />}
          {orderContext && <Field label="Patient" value={`${orderContext.patientRef} · ${orderContext.patientName}`} />}
          {orderContext && <Field label="Service" value={orderContext.service} />}
          <Field label="Plate ID" value={batch.batchId} />
          <Field label="Instrument" value={batch.instrument} />
        </div>

        {orderContext && orderContext.prescribed.length > 0 && (
          <div className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded">
            <h4 className="text-[11px] font-semibold text-slate-700 mb-1">Prescribed</h4>
            <div className="flex flex-wrap gap-1">
              {orderContext.prescribed.map((drug) => (
                <span key={drug} className="px-1.5 py-0.5 rounded text-[10px] bg-white border border-slate-200 text-slate-700">
                  {drug}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            {/* The count is the headline of the panel, so it carries the same
                red the positive rows below it do. */}
            <h4 className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
              {isControl ? (
                <>
                  Drugs
                  <span className={`px-1.5 py-0.5 rounded ${
                    failedCount > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {failedCount} of {outcome?.compoundCount ?? position.results.length} did not read{' '}
                    {outcome?.expected ?? 'as expected'}
                  </span>
                </>
              ) : (
                <>
                  Results
                  <span className={`px-1.5 py-0.5 rounded ${
                    position.positivesCount > 0
                      ? 'bg-red-100 text-red-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {position.positivesCount} positive drug{position.positivesCount === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </h4>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-[10px] text-slate-500 hover:text-slate-700"
              title={batch.extraColumns.length
                ? `${batch.extraColumns.length} unmapped columns available on each row`
                : undefined}
            >
              {showAll
                ? (isControl ? 'Only the failures' : 'Only inconsistent')
                : `Show all ${position.results.length}`}
            </button>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-max">
            <thead className="text-slate-500 border-b border-slate-200">
              <tr className="text-left">
                <th className="py-1 pr-3 font-medium">Drug</th>
                <th className="py-1 pr-3 font-medium">{isControl ? 'Found' : 'Result'}</th>
                {isControl && <th className="py-1 pr-3 font-medium">Expected</th>}
                <th className="py-1 pr-3 font-medium">{isControl ? 'Read as' : 'Interpretation'}</th>
                {!isControl && <th className="py-1 pr-3 font-medium">Prescribed</th>}
                {!isControl && <th className="py-1 pr-3 font-medium">Consistent</th>}
                {columns.cutOff && <th className="py-1 pr-3 font-medium">Cut-off</th>}
                {columns.accuracy && <th className="py-1 pr-3 font-medium">Recovery</th>}
                {columns.retentionTime && <th className="py-1 pr-3 font-medium">RT</th>}
                {columns.ionRatio && <th className="py-1 pr-3 font-medium">Ion ratio</th>}
                {columns.signalToNoise && <th className="py-1 pr-3 font-medium">S/N</th>}
                {columns.istdArea && <th className="py-1 pr-3 font-medium">ISTD area</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((result) => {
                // Unmapped columns ride along on each result; reveal them here,
                // the way molecular shows its additional target metrics.
                const extras = Object.entries(result.extras ?? {})
                const open = extrasFor === result.compound
                const flagged = isControl
                  ? controlFailed(result)
                  : interpretationFor(result) === 'Positive'
                return (
                <Fragment key={result.compound}>
                <tr
                  className={`border-b border-slate-100 ${
                    flagged ? 'bg-red-50' : ''
                  } ${extras.length ? `cursor-pointer ${flagged ? 'hover:bg-red-100' : 'hover:bg-slate-50'}` : ''}`}
                  onClick={() => extras.length && setExtrasFor(open ? null : result.compound)}
                >
                  <td className="py-1 text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      {extras.length > 0 && (
                        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                      )}
                      <AssayBadge batch={batch} />
                      {result.compound}
                    </span>
                    {batch.voidedCompounds.includes(result.compound) && (
                      <span className="ml-1 text-[9px] text-red-700 font-semibold">voided</span>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-slate-700 whitespace-nowrap">
                    {formatConcentration(result.concentration)}
                    {result.unit ? ` ${result.unit}` : ''}
                  </td>
                  {isControl && (
                    <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                      {outcome?.expected ?? '—'}
                    </td>
                  )}
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {isControl
                      ? <ControlRecovery result={result} outcome={outcome} />
                      : <span className={interpretationClass(result)}>{interpretationFor(result)}</span>}
                  </td>
                  {!isControl && (
                    <td className="py-1 pr-3 text-slate-600">
                      {prescribed.includes(result.compound) ? 'Yes' : '—'}
                    </td>
                  )}
                  {!isControl && (
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {(() => {
                        const verdict = consistencyFor(result, prescribed)
                        return (
                          <span
                            title={verdict.label}
                            className={verdict.consistency === 'Inconsistent'
                              ? 'text-red-700 font-medium'
                              : 'text-slate-600'}
                          >
                            {verdict.consistency}
                          </span>
                        )
                      })()}
                    </td>
                  )}
                  {columns.cutOff && (
                    <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                      {formatConcentration(result.cutOff)}
                    </td>
                  )}
                  {columns.accuracy && (
                    <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                      {result.accuracy != null ? `${result.accuracy.toFixed(1)}%` : '—'}
                    </td>
                  )}
                  {columns.retentionTime && (
                    <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                      {result.retentionTime?.toFixed(3) ?? '—'}
                    </td>
                  )}
                  {columns.ionRatio && (
                    <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                      {result.ionRatio
                        ? <span className={Math.abs(result.ionRatio.percentDiff) > 20 ? 'text-red-700 font-medium' : ''}>
                            {result.ionRatio.percentDiff.toFixed(0)}%
                          </span>
                        : '—'}
                    </td>
                  )}
                  {columns.signalToNoise && (
                    <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                      {result.signalToNoise?.toFixed(1) ?? '—'}
                    </td>
                  )}
                  {columns.istdArea && (
                    <td className="py-1 pr-3 text-slate-500 whitespace-nowrap">
                      {result.istdArea?.toLocaleString() ?? '—'}
                    </td>
                  )}
                </tr>
                {open && (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={12} className="py-2 px-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">
                        Additional fields from the file
                      </p>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {extras.map(([key, value]) => (
                          <div key={key} className="flex gap-1.5 min-w-0">
                            <dt className="text-slate-500 shrink-0 truncate max-w-[52%]" title={key}>{key}</dt>
                            <dd className="text-slate-800 font-medium truncate" title={value}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
          </div>

          {shown.length === 0 && (
            <p className="py-3 text-center text-[11px] text-slate-500">
              {isControl
                ? `Every drug this control covers read ${outcome?.expected ?? 'as expected'}.`
                : 'Every drug agrees with what was prescribed.'}
            </p>
          )}
        </div>

        {!isControl && orderContext && (
          <HistorySection
            collectedOn={orderContext.previousCollectedOn}
            rows={orderContext.history}
          />
        )}

        </div>
      </div>

    </aside>
  )
}

/**
 * What the drug actually read on this control, against what its configured
 * operator expected of it.
 */
function ControlRecovery({
  result,
  outcome,
}: {
  result: CompoundResult
  outcome: ControlOutcome | null
}) {
  if (!outcome) return <span className="text-slate-300">—</span>
  const failed = outcome.failedCompounds.includes(result.compound)
  // A drug that missed the expectation read the other way round.
  const readAs = failed
    ? (outcome.expected === 'Positive' ? 'Negative' : 'Positive')
    : outcome.expected
  return failed
    ? <span className="text-red-700 font-medium">{readAs}</span>
    : <span className="text-emerald-700">{readAs}</span>
}

/**
 * What this patient's previous specimen reported, read on the cut-offs in force
 * now — so the two visits are comparable without doing the arithmetic.
 */
function HistorySection({
  collectedOn,
  rows,
}: {
  collectedOn: string
  rows: ToxHistoryEntry[]
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <h4 className="text-[11px] font-semibold text-slate-700">History</h4>
        <span
          title="The patient's previous specimen, for comparison with this one"
          className="w-3 h-3 rounded-full bg-slate-700 text-white text-[8px] font-bold flex items-center justify-center cursor-default"
          aria-label="About this history"
        >
          i
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-slate-500">
          No previous specimen on record for this patient.
        </p>
      ) : (
        // Same table treatment as the results above: the two are read together.
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-max">
            <thead className="text-slate-500 border-b border-slate-200">
              <tr className="text-left">
                <th className="py-1 pr-3 font-medium">Name</th>
                <th className="py-1 pr-3 font-medium">Sample Type</th>
                <th className="py-1 pr-3 font-medium whitespace-nowrap">{collectedOn}</th>
                <th className="py-1 pr-3 font-medium">Unit</th>
                <th className="py-1 pr-3 font-medium">Cut Off</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.drug} className="border-b border-slate-100">
                  <td className="py-1 pr-3 text-slate-800">{row.drug}</td>
                  <td className="py-1 pr-3 text-slate-500">{row.sampleType}</td>
                  <td className="py-1 pr-3 text-slate-700 whitespace-nowrap">{row.value}</td>
                  <td className="py-1 pr-3 text-slate-500">{row.unit}</td>
                  <td className="py-1 pr-3 text-slate-500">{row.cutOff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium">{value || '—'}</dd>
    </div>
  )
}
