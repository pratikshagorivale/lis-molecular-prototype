import { useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Accordion } from '../ui/Accordion'
import { batchCounts, formatConcentration } from '../../utils/toxEvaluation'
import { interpretationFor } from '../../utils/toxConsistency'
import { templateForInstrument, type ToxInstrument } from '../../data/toxInstruments'
import type { TemplateFileCheck } from '../../types/toxTemplate'
import type { ToxFileContext } from '../../utils/parseToxFile'
import type { ToxBatch } from '../../types/tox'

/**
 * Upload is two decisions: which instrument the batch was run on, and which
 * samples to take forward.
 *
 * The technologist picks the instrument, not the parser — the vendor software
 * that wrote the file is not something anyone at the bench knows. Each
 * instrument carries the parser commissioned for its export, so there is
 * nothing to map here. A file that does not fit is refused with the reason,
 * and that check is the only thing standing between a wrong pick and a
 * confidently wrong batch.
 */

function FileStep({
  instrument,
  onFileSelect,
  parsing,
  error,
}: {
  instrument: ToxInstrument
  onFileSelect: (file: File) => void
  parsing: boolean
  error?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    onFileSelect(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      <svg className="w-10 h-10 mx-auto text-blue-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      <p className="text-sm font-semibold text-slate-800 mb-1">
        Select the file from {instrument.name}
      </p>
      <p className="text-xs text-slate-500 mb-4">
        Upload the export exactly as it comes off the instrument software — nothing to edit first.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.tsv,.xls,.xlsx,.CSV,.TXT,.TSV,.XLS,.XLSX"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={parsing}
        className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {parsing ? 'Reading file...' : 'Browse files...'}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-4 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}
      <p className="text-[10px] text-slate-400 mt-3">or drag and drop your file here</p>
    </div>
  )
}

/** A refusal, with the reason and the parser that would have worked. */
function MismatchNotice({
  check,
  instrument,
  suggestion,
  onUseSuggestion,
  onChooseAnother,
}: {
  check: TemplateFileCheck
  instrument: ToxInstrument
  suggestion: ToxInstrument | null
  onUseSuggestion: (instrument: ToxInstrument) => void
  onChooseAnother: () => void
}) {
  return (
    <div className="border border-red-200 bg-red-50 rounded p-4">
      <div className="flex gap-2.5">
        <svg className="w-5 h-5 text-red-600 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z" />
        </svg>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-red-900">
            This file does not look like a {instrument.name} export.
            {suggestion && ` It looks like it came off ${suggestion.name}.`}
          </h3>
          <p className="text-xs text-red-800 mt-1.5">
            {instrument.name} results carry {check.missingColumns.length === 1 ? 'a column' : 'columns'} this
            file does not have:
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {check.missingColumns.map((column) => (
              <span key={column} className="px-1.5 py-0.5 rounded bg-white border border-red-200 text-[11px] font-mono text-red-900">
                {column}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            {suggestion && (
              <button
                type="button"
                onClick={() => onUseSuggestion(suggestion)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
              >
                Use {suggestion.name} instead
              </button>
            )}
            <button
              type="button"
              onClick={onChooseAnother}
              className="px-3 py-1.5 border border-slate-300 bg-white text-slate-700 rounded text-xs font-medium hover:bg-slate-50"
            >
              Choose a different file
            </button>
          </div>
          {!suggestion && (
            <p className="text-[11px] text-red-800 mt-3">
              If this is a new instrument, send the export to CrelioHealth and it will be added to
              your instrument list.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Run date as an ISO day, for the date input. Falls back to today. */
function toIsoDate(value: string): string {
  const parsed = Date.parse(value)
  const date = Number.isNaN(parsed) ? new Date() : new Date(parsed)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export type PlateLayoutChoice = 'rack' | '96' | '384'

export interface PlateOverrides {
  plateId: string
  runDate: string
  layout: PlateLayoutChoice
}

/**
 * What the parser read, with the three things the lab owns left editable.
 *
 * The plate id is what is written on the plate, and it routinely disagrees
 * with anything in the file. The layout is a fact about how the run was
 * pipetted that the instrument does not record. The run date can be wrong when
 * a batch is re-processed.
 */
function PlateSummaryPanel({
  batch,
  overrides,
  onChange,
  onLayoutChange,
  busy,
}: {
  batch: ToxBatch
  overrides: PlateOverrides
  onChange: (next: PlateOverrides) => void
  onLayoutChange: (layout: PlateLayoutChoice) => void
  busy: boolean
}) {
  const counts = batchCounts(batch)
  const inputClass =
    'w-full text-sm text-slate-800 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50'

  const readOnly = (label: string, value: string | number) => (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-slate-800 mt-0.5">{value}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="tox-plate-id">
            Plate ID
          </label>
          <input
            id="tox-plate-id"
            type="text"
            value={overrides.plateId}
            onChange={(e) => onChange({ ...overrides, plateId: e.target.value.toUpperCase() })}
            placeholder="As written on the plate"
            className={`${inputClass} uppercase`}
          />
          {batch.fileBatchId && (
            <p className="text-[11px] text-amber-600 mt-1">
              Filename says {batch.fileBatchId}; the data files say {batch.batchId}.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="tox-layout">
            Layout
          </label>
          <select
            id="tox-layout"
            value={overrides.layout}
            onChange={(e) => onLayoutChange(e.target.value as PlateLayoutChoice)}
            disabled={busy}
            className={inputClass}
          >
            <option value="96">96-well plate</option>
            <option value="384">384-well plate</option>
            <option value="rack">Vial rack</option>
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            {batch.layout === 'grid'
              ? `${batch.positions.length} positions on the grid`
              : `${batch.positions.length} vials in sequence`}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="tox-run-date">
            Run date
          </label>
          <input
            id="tox-run-date"
            type="date"
            value={overrides.runDate}
            onChange={(e) => onChange({ ...overrides, runDate: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
        {readOnly('Instrument', batch.instrument)}
        {readOnly('Panel', batch.panel)}
        {readOnly('Samples', counts.samples)}
        {readOnly('Controls', counts.controls)}
      </div>
    </div>
  )
}

interface UploadToxResultsModalProps {
  open: boolean
  onClose: () => void
  onContinue: (selectedPositionIds: string[], overrides: PlateOverrides) => void
  onLayoutChange: (layout: PlateLayoutChoice) => void
  onFileSelect: (file: File, instrument: ToxInstrument) => void
  onUseInstrument: (instrument: ToxInstrument) => void
  selectedInstrument: ToxInstrument | null
  suggestion: ToxInstrument | null
  context: ToxFileContext | null
  batch: ToxBatch | null
  check: TemplateFileCheck | null
  onReset: () => void
  parsing: boolean
  error: string | null
}

export function UploadToxResultsModal({
  open,
  onClose,
  onContinue,
  onLayoutChange,
  onFileSelect,
  onUseInstrument,
  selectedInstrument,
  suggestion,
  context,
  batch,
  check,
  onReset,
  parsing,
  error,
}: UploadToxResultsModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastBatch, setLastBatch] = useState<ToxBatch | null>(null)
  const [overrides, setOverrides] = useState<PlateOverrides>({ plateId: '', runDate: '', layout: '96' })

  const samples = batch?.positions.filter((p) => p.type === 'Sample') ?? []

  // Adjusted during render rather than in an effect: a newly parsed batch
  // starts with every sample ticked and the fields pre-filled from the file.
  if (batch !== lastBatch) {
    setLastBatch(batch)
    setSelected(new Set(batch?.positions.filter((p) => p.type === 'Sample').map((p) => p.positionId) ?? []))
    if (batch) {
      setOverrides({
        plateId: batch.batchId,
        runDate: toIsoDate(batch.runDate),
        layout: batch.layout === 'rack' ? 'rack' : (batch.plateSize === 384 ? '384' : '96'),
      })
    }
  }

  const allSelected = samples.length > 0 && samples.every((p) => selected.has(p.positionId))
  const someSelected = samples.some((p) => selected.has(p.positionId))
  const mappedTemplate = selectedInstrument ? templateForInstrument(selectedInstrument) : null
  const mismatch = check != null && !check.ok

  const toggle = (positionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(positionId)) next.delete(positionId)
      else next.add(positionId)
      return next
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload Toxicology Results"
      size="xl"
      footer={
        <div className="flex items-center justify-between">
          {context && !mismatch ? (
            <button onClick={onReset} className="text-xs text-blue-600 hover:underline">
              Choose different file
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onContinue([...selected], overrides)}
              disabled={!batch || mismatch || selected.size === 0}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue to Validation
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* The device that opened this modal writes one export format, so the
            parser is already settled. Say which, rather than ask. */}
        <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-800">
              {selectedInstrument?.name ?? 'Toxicology instrument'}
            </span>
            {selectedInstrument && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                selectedInstrument.assayRole === 'screening'
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {selectedInstrument.assayRole === 'screening' ? 'Screening' : 'Confirmation'}
              </span>
            )}
          </div>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
            <div className="flex gap-1.5 min-w-0">
              <dt className="text-slate-500 shrink-0">Panel</dt>
              <dd className="text-slate-800 truncate">{selectedInstrument?.panel ?? '—'}</dd>
            </div>
            <div className="flex gap-1.5 min-w-0">
              <dt className="text-slate-500 shrink-0">Parser</dt>
              <dd className="text-slate-800 truncate">{mappedTemplate?.label ?? 'Not configured'}</dd>
            </div>
          </dl>
        </div>

        {context && !mismatch && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-emerald-900 flex-1 min-w-0 truncate">
              {context.fileName} — {context.sourceColumns.length} columns read
            </span>
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 px-2 py-0.5 text-emerald-800 border border-emerald-300 bg-white rounded text-[11px] font-medium hover:bg-emerald-100"
            >
              Choose another file
            </button>
          </div>
        )}

        {selectedInstrument && !context && (
          <div>
            <h3 className="text-xs font-semibold text-slate-800 mb-2">Choose the file</h3>
            <FileStep
              instrument={selectedInstrument}
              onFileSelect={(file) => onFileSelect(file, selectedInstrument)}
              parsing={parsing}
              error={error}
            />
          </div>
        )}

        {mismatch && check && selectedInstrument && (
          <MismatchNotice
            check={check}
            instrument={selectedInstrument}
            suggestion={suggestion}
            onUseSuggestion={onUseInstrument}
            onChooseAnother={onReset}
          />
        )}

        {context && batch && !mismatch && (
          <>
            {batch.warnings.map((warning) => (
              <div key={warning} className="flex gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded">
                <svg className="w-4 h-4 text-amber-600 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z" />
                </svg>
                <p className="text-[11px] text-amber-900">{warning}</p>
              </div>
            ))}

            <Accordion title="Plate Summary" defaultOpen>
              <PlateSummaryPanel
                batch={batch}
                overrides={overrides}
                onChange={setOverrides}
                onLayoutChange={(layout) => {
                  setOverrides((prev) => ({ ...prev, layout }))
                  onLayoutChange(layout)
                }}
                busy={parsing}
              />
            </Accordion>

            <Accordion title="Raw File Data" defaultOpen={false}>
              <pre className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded overflow-x-auto font-mono whitespace-pre max-h-40">
                {context.rawText}
              </pre>
            </Accordion>

            {/* Step 3 — what came out, and what to take forward. */}
            <Accordion title="Parsed Results" defaultOpen>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-600">
                  {samples.length} sample{samples.length === 1 ? '' : 's'} and{' '}
                  {batch.positions.length - samples.length} control positions —{' '}
                  {selected.size} selected
                </span>
              </div>

              <div className="border border-slate-200 rounded overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-700 text-white">
                      <th className="px-2 py-1.5 text-left font-medium">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(input) => {
                              if (input) input.indeterminate = someSelected && !allSelected
                            }}
                            onChange={() => setSelected(allSelected
                              ? new Set()
                              : new Set(samples.map((p) => p.positionId)))}
                            className="rounded border-slate-300 text-blue-600"
                            aria-label="Select all positions"
                          />
                          <span>Position</span>
                        </label>
                      </th>
                      <th className="px-2 py-1.5 text-left font-medium">Sample ID</th>
                      <th className="px-2 py-1.5 text-left font-medium">Positives</th>
                      <th className="px-2 py-1.5 text-left font-medium">Top result</th>
                      <th className="px-2 py-1.5 text-left font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((position) => {
                      const top = position.results
                        .filter((r) => interpretationFor(r) === 'Positive')
                        .sort((a, b) => (b.concentration ?? 0) - (a.concentration ?? 0))[0]
                      return (
                        <tr key={position.positionId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-1.5 text-slate-600">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selected.has(position.positionId)}
                                onChange={() => toggle(position.positionId)}
                                className="rounded border-slate-300 text-blue-600"
                                aria-label={`Select position ${position.positionId}`}
                              />
                              <span>{position.plateId} · {position.positionId}</span>
                            </label>
                          </td>
                          <td className="px-2 py-1.5 text-slate-800">{position.sampleId}</td>
                          <td className="px-2 py-1.5 text-slate-600">{position.positivesCount}</td>
                          <td className="px-2 py-1.5 text-slate-600">
                            {top ? `${top.compound} ${formatConcentration(top.concentration)}` : '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {position.requiresDilution
                              ? <span className="text-amber-700 font-medium">Over curve</span>
                              : <span className="text-slate-500">OK</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Accordion>
          </>
        )}
      </div>
    </Modal>
  )
}
