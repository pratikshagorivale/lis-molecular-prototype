import { isInconclusiveAmpStatus, isPositiveResult } from '../utils/interpretation'
import type { WellData } from '../types'

interface PlateViewProps {
  wells: WellData[]
  selectedWellId?: string | null
  onWellClick: (well: WellData) => void
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

type WellCardType = 'sample' | 'control' | 'empty'

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

function wellShowsQcFailed(well: WellData, cardType: WellCardType): boolean {
  if (cardType === 'control') return Boolean(well.controlFailed)
  if (cardType === 'sample') return Boolean(well.affectedByTargetedControlFailure)
  return false
}

function cardClassName(well: WellData): string {
  const cardType = wellCardType(well)
  const failed = wellShowsQcFailed(well, cardType)
  const border = failed ? 'border-2 border-red-500' : 'border-2 border-emerald-500'

  if (cardType === 'empty') {
    return 'bg-white border border-dotted border-slate-300 text-slate-400'
  }
  if (cardType === 'control') {
    return `bg-blue-200 text-blue-950 hover:bg-blue-300 cursor-pointer ${border}`
  }
  return `bg-white text-slate-800 hover:bg-slate-50 cursor-pointer ${border}`
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

type TargetDotState = 'detected' | 'notDetected' | 'inconclusive'

const dotStyles: Record<TargetDotState, string> = {
  detected: 'bg-red-500',
  notDetected: 'bg-emerald-500',
  inconclusive: 'bg-amber-400',
}

function totalTargetsTested(well: WellData): number {
  if (well.totalTargetCount != null) return well.totalTargetCount
  if (well.ctValues.length > 0) return well.ctValues.length
  return well.detectedTargets.length + well.notDetectedTargets.length
}

function targetDotStates(well: WellData): TargetDotState[] {
  if (well.ctValues.length > 0) {
    return well.ctValues.flatMap((cv) => {
      if (cv.interpretation === 'Passed') return []
      if (cv.interpretation === 'Inconclusive' || isInconclusiveAmpStatus(cv.ampStatus)) return ['inconclusive']
      if (isPositiveResult(cv.interpretation)) return ['detected']
      return ['notDetected']
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

export function PlateView({ wells, selectedWellId, onWellClick }: PlateViewProps) {
  const wellMap = new Map(wells.map((w) => [w.wellId, w]))

  return (
    <div className="bg-white border border-slate-200 rounded p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-sm bg-white border-2 border-emerald-500 shadow-sm" />
          Sample Valid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-sm bg-white border-2 border-red-500 shadow-sm" />
          Sample invalid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-sm bg-blue-200 border-2 border-emerald-500 shadow-sm" />
          Control · Passed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-sm bg-blue-200 border-2 border-red-500 shadow-sm" />
          Control · Failed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-sm bg-white border border-dotted border-slate-300" />
          Empty
        </span>
        <span className="flex items-center gap-2 ml-1 pl-3 border-l border-slate-200 text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Detected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Not Detected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Inconclusive
          </span>
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
                  runDate: '',
                  sampleId: '',
                  accessionNumber: '',
                  patient: '',
                  testOrder: '',
                  panel: '',
                  isQc: false,
                  qcType: '',
                  status: 'empty' as const,
                  label: '',
                  qcStatus: 'QC Passed' as const,
                  detectedTargets: [],
                  notDetectedTargets: [],
                  targetRows: [],
                  controlValidations: [],
                  ctValues: [],
                  validationChecks: [],
                  isFailed: false,
                  controlFailed: false,
                  affectedByTargetedControlFailure: false,
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
                    className={`relative w-[72px] h-[52px] rounded-sm text-left p-1 transition-colors ${cardClassName(well)} ${
                      well.wellId === selectedWellId ? 'ring-2 ring-blue-600 ring-offset-1 z-10' : ''
                    }`}
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
