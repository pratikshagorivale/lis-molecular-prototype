import type { ToxBatch } from '../../types/tox'

/**
 * Screening or confirmation, as a one-letter mark.
 *
 * The distinction belongs to the run, not to the drug: a screening assay
 * reports presumptive findings, a confirmation assay quantifies them. Every
 * drug on a run therefore carries the same mark.
 */
export function AssayBadge({ batch }: { batch: ToxBatch }) {
  const screening = batch.assayRole === 'screening'
  return (
    <span
      title={screening ? 'Screening' : 'Confirmation'}
      aria-label={screening ? 'Screening' : 'Confirmation'}
      className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold shrink-0 ${
        screening ? 'bg-slate-700 text-white' : 'bg-blue-700 text-white'
      }`}
    >
      {screening ? 'S' : 'C'}
    </span>
  )
}
