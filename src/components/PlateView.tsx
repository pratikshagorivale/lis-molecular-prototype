import { isInconclusiveAmpStatus, isPositiveResult } from '../utils/interpretation'
import type { WellData } from '../types'

interface PlateViewProps {
  wells: WellData[]
  onWellClick: (well: WellData) => void
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

type WellCardType = 'sample' | 'control' | 'empty'

const cardStyles: Record<WellCardType, string> = {
  sample: 'bg-white border-slate-400 text-slate-800 hover:bg-slate-50 cursor-pointer',
  control: 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100 cursor-pointer',
  empty: 'bg-slate-100 border-slate-300 border-dashed text-slate-400',
}

const failedControlStyle =
  'bg-red-50 border-red-400 text-red-900 hover:bg-red-100 cursor-pointer ring-1 ring-red-300'

function cardClassName(well: WellData): string {
  if (well.controlFailed) return failedControlStyle
  return cardStyles[wellCardType(well)]
}

function wellCardType(well: Pick<WellData, 'status' | 'isQc' | 'qcType' | 'panel' | 'sampleId'>): WellCardType {
  if (well.status === 'empty') return 'empty'
  if (
    well.status === 'control'
    || well.isQc
    || well.panel === 'Control'
    || !!well.qcType
    || /^(PC|NC|NTC|IC)$/i.test(well.sampleId)
    || well.qcType === 'IC'
  ) {
    return 'control'
  }
  return 'sample'
}

function wellDisplayLabel(well: Pick<WellData, 'sampleId' | 'label' | 'qcType'>): string {
  const sampleId = well.sampleId?.trim()
  if (sampleId && sampleId.toUpperCase() !== 'QC') return sampleId
  if (/^(PC|NC|NTC|IC)$/i.test(sampleId || '')) return sampleId!
  if (well.qcType && well.qcType !== 'QC') return well.qcType
  const label = well.label?.trim()
  if (label && label.toUpperCase() !== 'QC') return label
  return sampleId || label || ''
}

type TargetDotState = 'detected' | 'notDetected' | 'inconclusive' | 'passed'

const dotStyles: Record<TargetDotState, string> = {
  detected: 'bg-red-500',
  notDetected: 'bg-emerald-500',
  inconclusive: 'bg-amber-400',
  passed: 'bg-blue-500',
}

function totalTargetsTested(well: WellData): number {
  if (well.totalTargetCount != null) return well.totalTargetCount
  if (well.ctValues.length > 0) return well.ctValues.length
  return well.detectedTargets.length + well.notDetectedTargets.length
}

function targetDotStates(well: WellData): TargetDotState[] {
  if (well.ctValues.length > 0) {
    return well.ctValues.map((cv) => {
      if (cv.interpretation === 'Passed') return 'passed'
      if (isInconclusiveAmpStatus(cv.ampStatus)) return 'inconclusive'
      if (isPositiveResult(cv.interpretation, cv.ampStatus, cv.ct)) return 'detected'
      return 'notDetected'
    })
  }
  return [
    ...well.detectedTargets.map(() => 'detected' as const),
    ...well.notDetectedTargets.map(() => 'notDetected' as const),
  ]
}

function TargetDots({ states, max = 6 }: { states: TargetDotState[]; max?: number }) {
  if (states.length === 0) return null
  const visible = states.slice(0, max)
  const overflow = states.length - visible.length

  return (
    <div
      className="flex items-center gap-px shrink-0"
      title={[
        `${states.filter((s) => s === 'detected').length} detected`,
        `${states.filter((s) => s === 'notDetected').length} not detected`,
        `${states.filter((s) => s === 'inconclusive').length} inconclusive`,
      ].join(', ')}
    >
      {visible.map((state, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${dotStyles[state]}`} />
      ))}
      {overflow > 0 && <span className="text-[7px] text-slate-500 leading-none">+{overflow}</span>}
    </div>
  )
}

export function PlateView({ wells, onWellClick }: PlateViewProps) {
  const wellMap = new Map(wells.map((w) => [w.wellId, w]))

  return (
    <div className="bg-white border border-slate-200 rounded p-4">
      <div className="flex items-center gap-4 mb-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-slate-400" /> Sample</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-50 border border-blue-300" /> Control</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-400 ring-1 ring-red-300" /> Control Failed</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-dashed border-slate-300" /> Empty</span>
        <span className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Detected
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-2" /> Not Detected
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-2" /> Inconclusive
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-2" /> QC Passed
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex gap-1 mb-1 pl-8">
            {COLS.map((col) => (
              <div key={col} className="w-[72px] text-center text-[10px] font-medium text-slate-500">{col}</div>
            ))}
          </div>
          {ROWS.map((row) => (
            <div key={row} className="flex gap-1 mb-1">
              <div className="w-7 flex items-center justify-center text-[10px] font-medium text-slate-500">{row}</div>
              {COLS.map((col) => {
                const wellId = `${row}${col}`
                const well = wellMap.get(wellId) ?? {
                  wellId,
                  plateId: '',
                  sampleId: '',
                  patient: '',
                  testOrder: '',
                  panel: '',
                  isQc: false,
                  qcType: '',
                  status: 'empty' as const,
                  label: '',
                  detectedTargets: [],
                  notDetectedTargets: [],
                  ctValues: [],
                  validationChecks: [],
                  isFailed: false,
                  controlFailed: false,
                }
                const cardType = wellCardType(well)
                const isEmpty = cardType === 'empty'
                const total = totalTargetsTested(well)
                const dots = targetDotStates(well)

                return (
                  <button
                    key={wellId}
                    disabled={isEmpty}
                    onClick={() => !isEmpty && onWellClick(well)}
                    className={`relative w-[72px] h-[52px] border rounded text-left p-1 transition-colors ${cardClassName(well)}`}
                  >
                    <div className="flex items-start justify-between gap-0.5">
                      <div className="text-[10px] font-semibold leading-none">{wellId}</div>
                      {!isEmpty && <TargetDots states={dots} />}
                    </div>
                    {!isEmpty && (
                      <>
                        <div className="text-[9px] truncate leading-tight mt-0.5">{wellDisplayLabel(well)}</div>
                        <div className="text-[8px] font-medium opacity-90 leading-tight mt-0.5">
                          {total} Target{total !== 1 ? 's' : ''}
                        </div>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
