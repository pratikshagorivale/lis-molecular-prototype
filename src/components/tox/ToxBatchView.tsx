import { isPositionInvalid } from '../../utils/toxEvaluation'
import { inconsistentCount } from '../../utils/toxConsistency'
import type { ToxOrderContext } from '../../data/toxOrderContext'
import type { BatchPosition, ToxBatch } from '../../types/tox'

/**
 * Positions, laid out the way the instrument holds them. Agilent reports a
 * plate grid; Shimadzu reports a linear autosampler rack, so layout is a mode
 * rather than a constant 8x12.
 */

const ROW_LETTERS = 'ABCDEFGHIJKLMNOP'

/** Grid dimensions come from the batch's plate size, not a hard-coded 8x12. */
function gridFor(plateSize: 96 | 384 | null) {
  const { rows, cols } = plateSize === 384 ? { rows: 16, cols: 24 } : { rows: 8, cols: 12 }
  return {
    rows: ROW_LETTERS.slice(0, rows).split(''),
    cols: Array.from({ length: cols }, (_, i) => i + 1),
    // A 384 plate is twice as wide, so the card has to shrink to stay readable.
    dense: cols > 12,
  }
}

function isControl(position: BatchPosition): boolean {
  return position.type !== 'Sample'
}

/**
 * Four states, the same as the molecular plate: border carries the verdict,
 * fill carries the role.
 */
function cardClassName(position: BatchPosition, batch: ToxBatch, controlFailed: boolean): string {
  const failed = isControl(position) ? controlFailed : isPositionInvalid(position, batch)
  const border = failed ? 'border-red-500' : 'border-emerald-500'

  return isControl(position)
    ? `bg-blue-200 text-blue-950 hover:bg-blue-300 border-2 ${border} cursor-pointer`
    : `bg-white text-slate-800 hover:bg-slate-50 border-2 ${border} cursor-pointer`
}

function PositionCard({
  position,
  batch,
  inconsistent,
  selected,
  controlFailed,
  dense,
  onClick,
}: {
  position: BatchPosition
  batch: ToxBatch
  inconsistent: number
  selected: boolean
  controlFailed: boolean
  dense?: boolean
  onClick: () => void
}) {
  const control = isControl(position)
  const label = control ? position.controlName : position.sampleId

  return (
    <button
      type="button"
      onClick={onClick}
      title={isPositionInvalid(position, batch) ? 'Not releasable as it stands — open for the reason' : undefined}
      className={`relative ${dense ? 'w-[40px] h-[32px] p-0.5' : 'w-[74px] h-[56px] p-1'} rounded-sm text-left transition-colors ${cardClassName(position, batch, controlFailed)} ${
        selected ? 'ring-2 ring-blue-600 ring-offset-1 z-10' : ''
      }`}
    >
      <div className="text-[10px] font-semibold leading-none">{position.positionId}</div>
      {!dense && <div className="text-[9px] truncate leading-tight mt-0.5" title={label}>{label}</div>}
      {dense ? null : control ? (
        <div className="text-[8px] font-medium opacity-80 leading-tight mt-0.5">{position.type}</div>
      ) : (
        <div className="text-[8px] font-medium leading-tight mt-0.5">
          {/* What the reviewer is looking for is disagreement with the
              prescription, not the raw positive count. */}
          <span className={inconsistent > 0 ? 'text-red-600' : 'text-slate-400'}>
            {inconsistent} inconsistent
          </span>
        </div>
      )}
    </button>
  )
}

function EmptyCell({ positionId, dense }: { positionId: string; dense?: boolean }) {
  return (
    <div className={`${dense ? 'w-[40px] h-[32px]' : 'w-[74px] h-[56px]'} rounded-sm border border-dotted border-slate-300 bg-white p-1`}>
      {!dense && <span className="text-[10px] text-slate-300 font-semibold leading-none">{positionId}</span>}
    </div>
  )
}

export function ToxLegend({ layout }: { layout: 'grid' | 'rack' }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-[11px] text-slate-600">
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
      {layout === 'grid' && (
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-sm bg-white border border-dotted border-slate-300" />
          Empty
        </span>
      )}
    </div>
  )
}

interface ToxBatchViewProps {
  /** Prescriptions per sample, which is what consistency is judged against. */
  orderContext: Map<string, ToxOrderContext>
  batch: ToxBatch
  /** Only one plate is drawn at a time; a run can span several. */
  plateId: string
  selectedPositionId?: string | null
  onPositionClick: (position: BatchPosition) => void
}

/** Control positions whose configured control failed. */
function failedControlPositions(batch: ToxBatch): Set<string> {
  const failed = new Set<string>()
  for (const outcome of batch.controlOutcomes) {
    if (!outcome.passed && outcome.positionId) failed.add(outcome.positionId)
  }
  return failed
}

export function ToxBatchView({
  batch,
  plateId,
  orderContext,
  selectedPositionId,
  onPositionClick,
}: ToxBatchViewProps) {
  const inconsistentFor = (position: BatchPosition) =>
    position.type === 'Sample'
      ? inconsistentCount(position.results, orderContext.get(position.sampleId)?.prescribed ?? [])
      : 0

  const failedControls = failedControlPositions(batch)
  const positions = batch.positions.filter((p) => (p.plateId || 'Unplated') === plateId)

  if (positions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded p-6 text-center text-xs text-slate-500">
        No positions on {plateId}.
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded p-4">
      <ToxLegend layout={batch.layout} />

      {batch.layout === 'grid' ? (
        <GridLayout
          positions={positions}
          batch={batch}
          inconsistentFor={inconsistentFor}
          plateSize={batch.plateSize}
          selectedPositionId={selectedPositionId}
          failedControls={failedControls}
          onPositionClick={onPositionClick}
        />
      ) : (
        <RackLayout
          positions={positions}
          batch={batch}
          inconsistentFor={inconsistentFor}
          selectedPositionId={selectedPositionId}
          failedControls={failedControls}
          onPositionClick={onPositionClick}
        />
      )}
    </div>
  )
}

function GridLayout({
  positions,
  batch,
  inconsistentFor,
  plateSize,
  selectedPositionId,
  failedControls,
  onPositionClick,
}: {
  positions: BatchPosition[]
  batch: ToxBatch
  inconsistentFor: (position: BatchPosition) => number
  plateSize: 96 | 384 | null
  selectedPositionId?: string | null
  failedControls: Set<string>
  onPositionClick: (position: BatchPosition) => void
}) {
  const map = new Map(positions.map((p) => [p.positionId, p]))
  const { rows: ROWS, cols: COLS, dense } = gridFor(plateSize)
  const cell = dense ? 'w-[40px]' : 'w-[74px]'

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex gap-1 mb-1 pl-8">
          {COLS.map((col) => (
            <div key={col} className={`${cell} text-center text-[10px] font-medium text-slate-500`}>{col}</div>
          ))}
        </div>
        {ROWS.map((row) => (
          <div key={row} className="flex gap-1 mb-1">
            <div className="w-7 flex items-center justify-center text-[10px] font-medium text-slate-500">{row}</div>
            {COLS.map((col) => {
              const positionId = `${row}${col}`
              const position = map.get(positionId)
              if (!position) return <EmptyCell key={positionId} positionId={positionId} dense={dense} />
              return (
                <PositionCard
                  key={positionId}
                  position={position}
                  batch={batch}
                  inconsistent={inconsistentFor(position)}
                  dense={dense}
                  selected={position.positionId === selectedPositionId}
                  controlFailed={failedControls.has(position.positionId)}
                  onClick={() => onPositionClick(position)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** A rack has no rows or columns — vials just run in sequence. */
function RackLayout({
  positions,
  batch,
  inconsistentFor,
  selectedPositionId,
  failedControls,
  onPositionClick,
}: {
  positions: BatchPosition[]
  batch: ToxBatch
  inconsistentFor: (position: BatchPosition) => number
  selectedPositionId?: string | null
  failedControls: Set<string>
  onPositionClick: (position: BatchPosition) => void
}) {
  const ordered = [...positions].sort((a, b) => {
    const an = Number(a.positionId)
    const bn = Number(b.positionId)
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
    return a.positionId.localeCompare(b.positionId)
  })

  return (
    <div className="flex flex-wrap gap-1">
      {ordered.map((position) => (
        <PositionCard
          key={`${position.plateId}-${position.positionId}`}
          position={position}
          batch={batch}
          inconsistent={inconsistentFor(position)}
          selected={position.positionId === selectedPositionId}
          controlFailed={failedControls.has(position.positionId)}
          onClick={() => onPositionClick(position)}
        />
      ))}
    </div>
  )
}
