import { Drawer } from './ui/Drawer'
import { Badge } from './ui/Badge'
import { formatInterpretationDisplay } from '../utils/interpretation'
import type { WellData, WellStatus } from '../types'

interface WellDetailsDrawerProps {
  well: WellData | null
  onClose: () => void
}

function statusBadgeVariant(status: WellStatus) {
  if (status === 'ready') return 'success' as const
  if (status === 'failed') return 'error' as const
  if (status === 'control') return 'info' as const
  if (status === 'review') return 'warning' as const
  return 'neutral' as const
}

function statusLabel(status: WellStatus): string {
  if (status === 'ready') return 'Ready for Release'
  if (status === 'failed') return 'Failed'
  if (status === 'control') return 'QC Control'
  if (status === 'review') return 'Needs Review'
  return 'Empty'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="font-medium text-slate-800 mt-0.5">{value || '—'}</div>
    </div>
  )
}

export function WellDetailsDrawer({ well, onClose }: WellDetailsDrawerProps) {
  if (!well) return null

  const isControl = well.isQc || well.status === 'control'
  const totalTargets = well.totalTargetCount ?? well.detectedTargets.length + well.notDetectedTargets.length
  const notDetectedCount = well.notDetectedCount ?? well.notDetectedTargets.length

  return (
    <Drawer
      open={!!well}
      onClose={onClose}
      title={`Well ${well.wellId}`}
      footer={
        well.isFailed ? (
          <div className="flex gap-2">
            <button className="flex-1 px-3 py-1.5 border border-red-300 text-red-600 rounded text-xs font-medium hover:bg-red-50">
              Reject Result
            </button>
            <button className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
              Map Sample Manually
            </button>
          </div>
        ) : isControl ? (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-3 py-1.5 border border-slate-200 text-slate-600 rounded text-xs hover:bg-slate-50">
              Close
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="flex-1 px-3 py-1.5 border border-red-300 text-red-600 rounded text-xs font-medium hover:bg-red-50">
              Reject Sample
            </button>
            <button className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
              Release Sample
            </button>
            <button className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded text-xs hover:bg-slate-50">
              View Report
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant={statusBadgeVariant(well.status)}>{statusLabel(well.status)}</Badge>
          {isControl && <Badge variant="info">Is QC</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded p-3">
          <Field label="Plate" value={well.plateId} />
          <Field label="Well" value={well.wellId} />
          <Field label="Sample ID" value={well.sampleId} />
          <Field label="Patient" value={well.patient} />
          <Field label="Test Order" value={well.testOrder} />
          <Field label="Panel" value={well.panel} />
          {isControl && <Field label="QC Type" value={well.qcType || 'Control'} />}
          {!isControl && (
            <>
              <Field label="Targets Tested" value={String(totalTargets)} />
              <Field label="Not Detected" value={String(notDetectedCount)} />
            </>
          )}
        </div>

        {well.isFailed && well.validationErrors && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <div className="font-semibold text-red-700 mb-1">Validation Errors</div>
            <ul className="list-disc list-inside text-red-600 space-y-0.5">
              {well.validationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {well.ctValues.length > 0 && (
          <div>
            <div className="font-semibold text-slate-700 mb-1.5">Ct Values</div>
            <table className="w-full border border-slate-200 rounded overflow-hidden">
              <thead>
                <tr className="bg-slate-100">
                  <th className="px-2 py-1 text-left font-medium text-slate-600">Target</th>
                  <th className="px-2 py-1 text-left font-medium text-slate-600">Ct</th>
                  <th className="px-2 py-1 text-left font-medium text-slate-600">Amp Status</th>
                </tr>
              </thead>
              <tbody>
                {well.ctValues.map((cv) => (
                  <tr key={cv.target} className="border-t border-slate-100">
                    <td className="px-2 py-1 text-slate-700">{cv.target}</td>
                    <td className="px-2 py-1 text-slate-600">{cv.ct}</td>
                    <td className="px-2 py-1">
                      <span className={cv.interpretation === 'Detected' ? 'text-red-600 font-medium' : 'text-slate-500'}>
                        {formatInterpretationDisplay(cv.interpretation, cv.ampStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!well.isFailed && well.detectedTargets.length > 0 && (
          <div>
            <div className="font-semibold text-slate-700 mb-1.5">
              Detected Targets ({well.detectedTargets.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {well.detectedTargets.map((t) => (
                <Badge key={t} variant="success">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {!well.isFailed && well.notDetectedTargets.length > 0 && (
          <div>
            <div className="font-semibold text-slate-700 mb-1.5">
              Not Detected Targets ({well.notDetectedTargets.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {well.notDetectedTargets.map((t) => (
                <Badge key={t} variant="neutral">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {well.validationChecks.length > 0 && (
          <div>
            <div className="font-semibold text-slate-700 mb-1.5">Validation Checks</div>
            <div className="space-y-1">
              {well.validationChecks.map((check) => (
                <div key={check.label} className="flex items-center gap-2">
                  {check.passed ? (
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={check.passed ? 'text-slate-700' : 'text-red-600'}>{check.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}
