import { useState } from 'react'
import { Drawer } from './ui/Drawer'
import { Badge } from './ui/Badge'
import { PlateAuditTrail } from './PlateAuditTrail'
import { QcStatusIcon } from './QcStatusIcon'
import { formatAuditTimestamp } from '../utils/plateTracking'
import { controlLabel, failuresFromControls, uncoveredFailures } from '../utils/qcFailures'
import type { CapaRecord, PlateRecord } from '../types'
import { PLATE_STATUS_VARIANT, QC_OUTCOME_VARIANT } from './plateStatusStyles'

type PlateDetailTab = 'summary' | 'samples' | 'audit' | 'capa'

const DETAIL_TABS: { id: PlateDetailTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'samples', label: 'Samples' },
  { id: 'audit', label: 'Audit Trail' },
  { id: 'capa', label: 'CAPA' },
]

const CAPA_STATUS_VARIANT = {
  Open: 'warning',
  'In Progress': 'info',
  Closed: 'success',
} as const

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-xs text-slate-800 mt-0.5">{value}</dd>
    </div>
  )
}

function CapaCard({ capa, onClose }: { capa: CapaRecord; onClose: () => void }) {
  return (
    <div className="border border-slate-200 rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800">{capa.id}</span>
        <Badge variant={CAPA_STATUS_VARIANT[capa.status]}>{capa.status}</Badge>
      </div>
      <p className="text-[11px] font-medium text-slate-600">{capa.controlLabel}</p>
      <p className="text-[11px] text-slate-500">
        Raised by <span className="font-medium text-slate-700">{capa.raisedBy}</span> on {formatAuditTimestamp(capa.raisedAt)}
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
        <p className="text-[11px] text-amber-800">{capa.qcFailureSummary}</p>
      </div>
      <dl className="space-y-1.5">
        <Field label="Root Cause" value={capa.rootCause || <span className="text-slate-400">Not recorded</span>} />
        <Field label="Corrective Action" value={capa.correctiveAction || <span className="text-slate-400">Not recorded</span>} />
        <Field label="Preventive Action" value={capa.preventiveAction || <span className="text-slate-400">Not recorded</span>} />
      </dl>
      {capa.closedBy ? (
        <p className="text-[11px] text-emerald-700">
          Closed by {capa.closedBy} on {capa.closedAt ? formatAuditTimestamp(capa.closedAt) : '—'}
        </p>
      ) : (
        <button
          onClick={onClose}
          className="px-2.5 py-1 border border-emerald-500 text-emerald-700 rounded text-[11px] font-medium hover:bg-emerald-50"
        >
          Mark Closed
        </button>
      )}
    </div>
  )
}

/** Parent mounts this per plate (keyed), so tab and search reset for each plate opened. */
interface PlateDetailsDrawerProps {
  plate: PlateRecord
  /** Sample ID that led here, so the Samples tab can open pre-filtered on it. */
  highlightSampleId?: string
  onClose: () => void
  onOpenPlateView: (plateId: string) => void
  onRaiseCapa: (plateId: string) => void
  onCloseCapa: (plateId: string, capaId: string) => void
}

export function PlateDetailsDrawer({
  plate,
  highlightSampleId,
  onClose,
  onOpenPlateView,
  onRaiseCapa,
  onCloseCapa,
}: PlateDetailsDrawerProps) {
  // Arriving from a Sample ID search lands directly on that sample.
  const [tab, setTab] = useState<PlateDetailTab>(highlightSampleId ? 'samples' : 'summary')
  const [sampleSearch, setSampleSearch] = useState(highlightSampleId ?? '')

  const qcFailed = plate.qcOutcome !== 'Passed'
  const uncovered = uncoveredFailures(
    failuresFromControls(plate.qcControls),
    plate.capa.map((c) => c.control),
  )
  const filteredSamples = sampleSearch.trim()
    ? plate.samples.filter((s) =>
        [s.sampleId, s.accessionNumber, s.patient, s.wellId].some((v) =>
          v.toLowerCase().includes(sampleSearch.trim().toLowerCase()),
        ),
      )
    : plate.samples

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={`Plate ${plate.plateId}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          {uncovered.length > 0 && (
            <button
              onClick={() => onRaiseCapa(plate.plateId)}
              className="px-3 py-1.5 border border-amber-400 text-amber-700 rounded text-xs font-medium hover:bg-amber-50"
            >
              Raise CAPA
            </button>
          )}
          <button
            onClick={() => onOpenPlateView(plate.plateId)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
          >
            Open in Plate View
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-4 border-b border-slate-200 -mt-4 -mx-4 px-4 mb-3">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.id === 'capa' && plate.capa.length > 0 && (
              <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-1 rounded">{plate.capa.length}</span>
            )}
            {t.id === 'audit' && (
              <span className="ml-1 text-[10px] bg-slate-100 text-slate-500 px-1 rounded">{plate.auditTrail.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={PLATE_STATUS_VARIANT[plate.status]}>{plate.status}</Badge>
            <Badge variant={QC_OUTCOME_VARIANT[plate.qcOutcome]}>QC {plate.qcOutcome}</Badge>
          </div>

          {plate.qcControls.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Controls</p>
              <ul className="border border-slate-200 rounded divide-y divide-slate-100">
                {plate.qcControls.map((control) => (
                  <li key={control.control} className="flex items-center gap-2 px-2 py-1.5">
                    <QcStatusIcon passed={control.passed} />
                    <span className="text-xs text-slate-700">{controlLabel(control)}</span>
                    <span className={`ml-auto text-[11px] font-medium ${control.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                      {control.passed ? 'Passed' : 'Failed'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 bg-slate-50 border border-slate-200 rounded p-3">
            <Field label="Run Date" value={plate.runDate} />
            <Field label="Instrument" value={plate.instrument} />
            <Field label="Samples Processed" value={<span className="tabular-nums">{plate.samplesProcessed}</span>} />
            <Field
              label="Valid / Invalid"
              value={
                <span className="tabular-nums">
                  <span className="text-emerald-700 font-medium">{plate.samplesValid}</span>
                  <span className="text-slate-400"> / </span>
                  <span className="text-red-600 font-medium">{plate.samplesInvalid}</span>
                </span>
              }
            />
            <Field label="Uploaded By" value={plate.uploadedBy} />
            <Field label="Uploaded At" value={formatAuditTimestamp(plate.uploadedAt)} />
            {plate.releasedBy && <Field label="Released By" value={plate.releasedBy} />}
            {plate.releasedAt && <Field label="Released At" value={formatAuditTimestamp(plate.releasedAt)} />}
            {plate.rejectedBy && <Field label="Rejected By" value={<span className="text-red-600">{plate.rejectedBy}</span>} />}
            {plate.rejectedAt && <Field label="Rejected At" value={formatAuditTimestamp(plate.rejectedAt)} />}
          </dl>
        </div>
      )}

      {tab === 'samples' && (
        <div className="space-y-2">
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={sampleSearch}
              onChange={(e) => setSampleSearch(e.target.value)}
              placeholder="Search Sample ID, accession or patient"
              className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            {filteredSamples.length} of {plate.samples.length} samples
          </p>
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="px-2 py-1.5 text-left font-medium">Sample ID</th>
                  <th className="px-2 py-1.5 text-left font-medium">Patient</th>
                  <th className="px-2 py-1.5 text-left font-medium">Well</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSamples.map((sample) => (
                  <tr
                    key={`${sample.sampleId}-${sample.wellId}`}
                    className={`border-t border-slate-100 ${
                      highlightSampleId && sample.sampleId === highlightSampleId ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-2 py-1.5 font-medium text-slate-800 tabular-nums">{sample.sampleId}</td>
                    <td className="px-2 py-1.5 text-slate-600">{sample.patient}</td>
                    <td className="px-2 py-1.5 text-slate-600">{sample.wellId}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          sample.status === 'Failed'
                            ? 'text-red-600'
                            : sample.status === 'Needs Review'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }
                      >
                        {sample.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredSamples.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                      No samples match “{sampleSearch}”
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && <PlateAuditTrail entries={plate.auditTrail} />}

      {tab === 'capa' && (
        <div className="space-y-3">
          {plate.capa.length > 0 && uncovered.length > 0 && (
            <p className="text-[11px] text-amber-700">
              {uncovered.length} failed control{uncovered.length === 1 ? '' : 's'} without a CAPA:{' '}
              {uncovered.map((f) => f.label).join(', ')}
            </p>
          )}
          {plate.capa.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-slate-500">No CAPA recorded for this plate.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {qcFailed
                  ? 'This plate has a QC failure. Recording a CAPA is optional but recommended.'
                  : 'CAPA is normally raised only against a QC failure.'}
              </p>
              {uncovered.length > 0 && (
                <button
                  onClick={() => onRaiseCapa(plate.plateId)}
                  className="mt-3 px-3 py-1.5 border border-amber-400 text-amber-700 rounded text-xs font-medium hover:bg-amber-50"
                >
                  Raise CAPA
                </button>
              )}
            </div>
          ) : (
            plate.capa.map((capa) => (
              <CapaCard key={capa.id} capa={capa} onClose={() => onCloseCapa(plate.plateId, capa.id)} />
            ))
          )}
        </div>
      )}
    </Drawer>
  )
}
