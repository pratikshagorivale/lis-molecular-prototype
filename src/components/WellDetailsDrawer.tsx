import { Badge } from './ui/Badge'
import { displayTargetInterpretation } from '../utils/interpretation'
import type { WellAdditionalMetrics, WellControlValidation, WellData, WellQcStatus, WellTargetRow } from '../types'

interface WellDetailsPanelProps {
  well: WellData
  controlValidations: WellControlValidation[]
  onClose: () => void
}

function qcStatusVariant(status: WellQcStatus) {
  if (status === 'QC Passed') return 'success' as const
  if (status === 'QC Failed') return 'error' as const
  return 'warning' as const
}

function wellQcBadge(well: WellData, isControl: boolean): WellQcStatus {
  if (isControl) return well.controlFailed ? 'QC Failed' : 'QC Passed'
  if (well.affectedByTargetedControlFailure) return 'QC Failed'
  if (well.qcStatus === 'QC Warning') return 'QC Warning'
  return 'QC Passed'
}

function controlStatusVariant(passed: boolean) {
  return passed ? 'success' as const : 'error' as const
}

function Field({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="font-medium text-slate-800 mt-0.5 break-words">{value || '—'}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  )
}

function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <table className="w-full text-xs">{children}</table>
    </div>
  )
}

function formatResultValue(value: number | string) {
  if (value === '' || value == null) return '—'
  return String(value)
}

function hasAdditionalMetrics(metrics: WellAdditionalMetrics): boolean {
  return Boolean(
    metrics.ampStatus
    || metrics.ampScore
    || metrics.cqConfidence
    || metrics.reporterDye
    || metrics.thresholdValue,
  )
}

function interpretationClassName(interpretation: ReturnType<typeof displayTargetInterpretation>): string {
  if (interpretation === 'Detected') return 'text-red-600 font-medium'
  if (interpretation === 'Not Detected') return 'text-emerald-600 font-medium'
  if (interpretation === 'Inconclusive') return 'text-amber-600 font-medium'
  return 'text-slate-800'
}

function TargetMetricsGrid({ metrics }: { metrics: WellAdditionalMetrics }) {
  const rows = [
    { label: 'Amp Status', value: metrics.ampStatus },
    { label: 'Amp Score', value: metrics.ampScore },
    { label: 'Cq Confidence', value: metrics.cqConfidence },
    { label: 'Reporter Dye', value: metrics.reporterDye },
    { label: 'Threshold Value', value: metrics.thresholdValue },
  ].filter((row) => row.value)

  if (rows.length === 0) return null

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-2">Additional Metrics</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map((row) => (
          <Field key={row.label} label={row.label} value={row.value ?? ''} />
        ))}
      </div>
    </div>
  )
}

function TargetCard({ row }: { row: WellTargetRow }) {
  const interpretation = displayTargetInterpretation(row.interpretation, row.additionalMetrics?.ampStatus)

  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <div className="bg-slate-100 border-b border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
        {row.target}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-2.5 bg-white">
        <Field label="Result" value={formatResultValue(row.result)} />
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Interpretation</div>
          <div className={`mt-0.5 ${interpretationClassName(interpretation)}`}>
            {interpretation}
          </div>
        </div>
      </div>
      {row.additionalMetrics && hasAdditionalMetrics(row.additionalMetrics) && (
        <TargetMetricsGrid metrics={row.additionalMetrics} />
      )}
    </div>
  )
}

function WellInformationSection({ well, isControl }: { well: WellData; isControl: boolean }) {
  const fields = isControl
    ? [
        { label: 'Well ID', value: well.wellId },
        { label: 'Plate ID', value: well.plateId },
        { label: 'Test Name', value: well.panel },
        { label: 'Control', value: well.sampleId || well.patient },
      ]
    : [
        { label: 'Well ID', value: well.wellId },
        { label: 'Plate ID', value: well.plateId },
        { label: 'Run Date', value: well.runDate },
        { label: 'Test Name', value: well.panel },
        { label: 'Sample ID', value: well.sampleId },
        { label: 'Patient Name', value: well.patient },
      ]

  return (
    <Section title="Well Information">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 bg-slate-50 border border-slate-200 rounded p-3">
        {fields.map((field) => (
          <Field
            key={field.label}
            label={field.label}
            value={field.value}
            className={'span' in field && field.span ? 'col-span-2' : ''}
          />
        ))}
      </div>
    </Section>
  )
}

export function WellDetailsPanel({ well, controlValidations, onClose }: WellDetailsPanelProps) {
  const isControl = well.isQc || well.status === 'control'
  const qcBadge = wellQcBadge(well, isControl)

  return (
    <aside className="w-[380px] shrink-0 min-h-0 bg-white border-l border-slate-200 shadow-[-6px_0_16px_rgba(15,23,42,0.06)] flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Well {well.wellId}</h2>
          <Badge variant={qcStatusVariant(qcBadge)} size="md">
            {qcBadge}
          </Badge>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-white shrink-0"
          aria-label="Close well details"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 p-4 space-y-5">
        <WellInformationSection well={well} isControl={isControl} />

        {well.targetRows.length > 0 && (
          <Section title="Target Information">
            <div className="space-y-2">
              {well.targetRows.map((row) => (
                <TargetCard key={row.target} row={row} />
              ))}
            </div>
          </Section>
        )}

        {controlValidations.length > 0 && (
          <Section title="Control Validation">
            <DataTable>
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-2.5 py-2 text-left font-medium text-slate-600">Control</th>
                  <th className="px-2.5 py-2 text-left font-medium text-slate-600">Control Position</th>
                  <th className="px-2.5 py-2 text-left font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {controlValidations.map((row) => (
                  <tr key={`${row.control}-${row.position}`} className="border-t border-slate-100 first:border-t-0">
                    <td className="px-2.5 py-2 text-slate-700 font-medium">{row.control}</td>
                    <td className="px-2.5 py-2 text-slate-600">{row.position}</td>
                    <td className="px-2.5 py-2">
                      <Badge variant={controlStatusVariant(row.status === 'Pass')}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Section>
        )}

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
      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-white shrink-0">
        {well.isFailed ? (
          <div className="flex gap-2">
            <button type="button" className="flex-1 px-3 py-1.5 border border-red-300 text-red-600 rounded text-xs font-medium hover:bg-red-50">
              Reject Result
            </button>
            <button type="button" className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
              Map Sample Manually
            </button>
          </div>
        ) : isControl ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-1.5 border border-slate-200 text-slate-600 rounded text-xs hover:bg-slate-50"
          >
            Close
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" className="flex-1 px-3 py-1.5 border border-red-300 text-red-600 rounded text-xs font-medium hover:bg-red-50">
              Reject Sample
            </button>
            <button type="button" className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
              Release Sample
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
