import { formatAuditTimestamp } from '../utils/plateTracking'
import { QcStatusIcon } from './QcStatusIcon'
import type { PlateAuditAction, PlateAuditEvent } from '../types'

const ACTION_STYLES: Record<PlateAuditAction, { label: string; dot: string; text: string }> = {
  uploaded: { label: 'File Upload', dot: 'bg-blue-500', text: 'text-blue-700' },
  'qc-result': { label: 'QC Results', dot: 'bg-slate-400', text: 'text-slate-700' },
  released: { label: 'Released', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  rejected: { label: 'Rejected', dot: 'bg-red-500', text: 'text-red-700' },
  'capa-added': { label: 'CAPA Added', dot: 'bg-amber-500', text: 'text-amber-700' },
}

function QcResultList({ results }: { results: NonNullable<PlateAuditEvent['qcResults']> }) {
  return (
    <ul className="mt-1.5 border border-slate-200 rounded divide-y divide-slate-100">
      {results.map((result) => (
        <li key={result.control} className="flex items-start gap-2 px-2 py-1">
          <span className="mt-px">
            <QcStatusIcon passed={result.passed} />
          </span>
          <span className="min-w-0">
            <span className="text-[11px] font-medium text-slate-700">{result.control}</span>
            <span className={`text-[11px] ml-1.5 ${result.passed ? 'text-emerald-700' : 'text-red-700'}`}>
              {result.passed ? 'Passed' : 'Failed'}
            </span>
            {result.detail && <span className="block text-[11px] text-slate-500">{result.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface PlateAuditTrailProps {
  entries: PlateAuditEvent[]
}

export function PlateAuditTrail({ entries }: PlateAuditTrailProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[120px] text-xs text-slate-500">
        No audit events recorded for this plate yet
      </div>
    )
  }

  // Newest first — an issue report almost always starts from the most recent action.
  const ordered = [...entries].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))

  return (
    <ol className="relative">
      {ordered.map((entry, i) => {
        const style = ACTION_STYLES[entry.action]
        const isLast = i === ordered.length - 1
        return (
          <li key={entry.id} className="relative pl-6 pb-4">
            {!isLast && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-slate-200" aria-hidden />}
            <span className={`absolute left-0 top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${style.dot}`} aria-hidden />
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-xs font-semibold ${style.text}`}>{style.label}</span>
              <span className="text-[11px] text-slate-400">{formatAuditTimestamp(entry.timestamp)}</span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5">{entry.summary}</p>
            {entry.qcResults && entry.qcResults.length > 0 && <QcResultList results={entry.qcResults} />}
            <p className="text-[11px] text-slate-500 mt-1">
              <span className="font-medium text-slate-600">{entry.actor}</span>
              <span className="text-slate-400"> · {entry.actorRole}</span>
            </p>
            {entry.sampleIds && entry.sampleIds.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.sampleIds.slice(0, 8).map((id) => (
                  <span key={id} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded tabular-nums">
                    {id}
                  </span>
                ))}
                {entry.sampleIds.length > 8 && (
                  <span className="text-[10px] text-slate-400 px-1 py-0.5">
                    +{entry.sampleIds.length - 8} more
                  </span>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
