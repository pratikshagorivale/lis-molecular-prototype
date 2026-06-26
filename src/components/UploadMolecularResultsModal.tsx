import { useRef, useState, useEffect } from 'react'
import { Modal } from './ui/Modal'
import { Accordion } from './ui/Accordion'
import type { FileParseContext, ParsedUploadData, PlateSize, PreviewRow, UserFieldMapping } from '../types'
import { PLATE_SIZE_OPTIONS } from '../types'
import { displayTargetInterpretation } from '../utils/interpretation'
import { MAPPING_FIELD_DEFS, syncUserMappingsWithFieldDefs } from '../utils/parseMolecularFile'

const PREVIEW_COLUMN_KEYS = ['well', 'sampleId', 'target', 'result', 'interpretation', 'ampStatus', 'viralLoad'] as const

function previewColumnLabel(key: (typeof PREVIEW_COLUMN_KEYS)[number]): string {
  return MAPPING_FIELD_DEFS.find((field) => field.key === key)?.label ?? key
}

function previewInterpretationLabel(row: PreviewRow): string {
  if (row.interpretationValue?.trim()) return row.interpretationValue.trim()
  return displayTargetInterpretation(row.interpretation, row.ampStatus)
}

function previewInterpretationClassName(label: string): string {
  const normalized = label.trim().toLowerCase()
  if (normalized === 'detected' || normalized === 'detetected') return 'text-red-600 font-medium'
  if (normalized.includes('not detected') || normalized.includes('not detect')) return 'text-emerald-600 font-medium'
  if (normalized.includes('inconclusive') || normalized.includes('undetermined')) return 'text-amber-600 font-medium'
  return 'text-slate-600'
}

function renderPreviewCell(row: PreviewRow, key: (typeof PREVIEW_COLUMN_KEYS)[number]) {
  switch (key) {
    case 'well':
      return row.wellPosition || '—'
    case 'sampleId':
      return row.sampleId
    case 'target':
      return row.targetName
    case 'result':
      return row.ctValue ?? '—'
    case 'interpretation': {
      const label = previewInterpretationLabel(row)
      return <span className={previewInterpretationClassName(label)}>{label}</span>
    }
    case 'ampStatus':
      return row.ampStatus || '—'
    case 'viralLoad':
      return row.viralLoad || '—'
    default:
      return '—'
  }
}

interface UploadMolecularResultsModalProps {
  open: boolean
  onClose: () => void
  onContinue: () => void
  onSendResults: () => void
  fileContext: FileParseContext | null
  uploadData: ParsedUploadData | null
  userMappings: UserFieldMapping[]
  onMappingsChange: (mappings: UserFieldMapping[]) => void
  onApplyMappings: () => void
  onFileSelect: (file: File) => void
  applying: boolean
  parsing: boolean
  mappingError: string | null
  plateId: string
  onPlateIdChange: (value: string) => void
  plateSize: PlateSize
  onPlateSizeChange: (value: PlateSize) => void
  headerRow: number
  dataStartRow: number
  totalRows: number
  onHeaderRowChange: (row: number) => void
  onDataStartRowChange: (row: number) => void
}

function RowSettingCard({
  title,
  description,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  title: string
  description: string
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-slate-200 rounded-lg px-4 py-3 bg-white">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <label className="text-sm font-semibold text-slate-800 whitespace-nowrap">{label}</label>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (!Number.isNaN(next)) onChange(next)
          }}
          className="w-16 text-sm text-center text-slate-800 border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>
    </div>
  )
}

function PlateSummaryPanel({
  plateId,
  onPlateIdChange,
  plateIdFromFile,
  onApplyMappings,
  applying,
  plateSize,
  onPlateSizeChange,
  device,
  runDate,
  mappedSamples,
  controls,
  errors,
}: {
  plateId: string
  onPlateIdChange: (value: string) => void
  plateIdFromFile: boolean
  onApplyMappings: () => void
  applying: boolean
  plateSize: PlateSize
  onPlateSizeChange: (value: PlateSize) => void
  device: string
  runDate: string
  mappedSamples: number
  controls: number
  errors: number
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Plate ID</label>
          <input
            type="text"
            value={plateId}
            onChange={(e) => onPlateIdChange(e.target.value.toUpperCase())}
            placeholder="Enter plate ID"
            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
          />
          {!plateIdFromFile && (
            <p className="text-xs text-amber-600 mt-1">Not in file — enter manually</p>
          )}
          <button
            type="button"
            onClick={onApplyMappings}
            disabled={applying || !plateId.trim()}
            className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {applying ? 'Updating...' : 'Apply plate ID'}
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Plate selection</label>
          <select
            value={plateSize}
            onChange={(e) => onPlateSizeChange(Number(e.target.value) as PlateSize)}
            disabled={applying}
            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {PLATE_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs">
        <span className="text-slate-500">Device <span className="font-medium text-slate-800">{device}</span></span>
        <span className="text-slate-500">Run date <span className="font-medium text-slate-800">{runDate}</span></span>
        <span className="text-slate-500">Mapped <span className="font-semibold text-emerald-600">{mappedSamples}</span> samples</span>
        <span className="text-slate-500">Controls <span className="font-medium text-slate-800">{controls}</span></span>
        <span className="text-slate-500">Errors <span className={`font-semibold ${errors ? 'text-red-600' : 'text-slate-800'}`}>{errors}</span></span>
      </div>
    </div>
  )
}

function FileSelectStep({
  onFileSelect,
  parsing,
}: {
  onFileSelect: (file: File) => void
  parsing: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFileSelect(file)
  }

  return (
    <div className="p-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}
      >
        <svg className="w-12 h-12 mx-auto text-blue-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <p className="text-sm font-semibold text-slate-800 mb-1">Select file from your device</p>
        <p className="text-xs text-slate-500 mb-5">Upload .csv, .xls, or .xlsx exported from Google Sheets</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx,.CSV,.XLS,.XLSX"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {parsing ? 'Reading file...' : 'Browse files...'}
        </button>
        <p className="text-[10px] text-slate-400 mt-4">or drag and drop your file here</p>
      </div>
    </div>
  )
}

export function UploadMolecularResultsModal({
  open,
  onClose,
  onContinue,
  onSendResults,
  fileContext,
  uploadData,
  userMappings,
  onMappingsChange,
  onApplyMappings,
  onFileSelect,
  applying,
  parsing,
  mappingError,
  plateId,
  onPlateIdChange,
  plateSize,
  onPlateSizeChange,
  headerRow,
  dataStartRow,
  totalRows,
  onHeaderRowChange,
  onDataStartRowChange,
}: UploadMolecularResultsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [selectAll, setSelectAll] = useState(true)

  const ps = uploadData?.plateSummary
  const sourceColumns = fileContext?.sourceColumns ?? []

  useEffect(() => {
    if (uploadData && open) {
      setRows(uploadData.previewRows)
      setSelectAll(true)
    }
    if (!open) setRows([])
  }, [uploadData, open])

  const toggleRow = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)))
  }

  const toggleAll = () => {
    const newVal = !selectAll
    setSelectAll(newVal)
    setRows((prev) => prev.map((r) => (r.validationStatus === 'Valid' ? { ...r, selected: newVal } : r)))
  }

  const updateMapping = (key: string, sourceColumn: string) => {
    const synced = syncUserMappingsWithFieldDefs(userMappings)
    onMappingsChange(synced.map((m) => (m.key === key ? { ...m, sourceColumn } : m)))
  }

  const canContinue = !!uploadData && uploadData.previewRows.length > 0 && !!plateId.trim()
  const plateIdFromFile = !!syncUserMappingsWithFieldDefs(userMappings).find((m) => m.key === 'plateId')?.sourceColumn

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload Molecular Results"
      size="xl"
      footer={
        fileContext ? (
          <div className="flex items-center justify-between">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-blue-600 hover:underline"
            >
              Choose different file
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={onSendResults}
                disabled={!canContinue}
                className="px-4 py-1.5 border border-blue-600 text-blue-600 rounded text-xs font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Results
              </button>
              <button
                type="button"
                onClick={onContinue}
                disabled={!canContinue}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue to Validation
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        )
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelect(file)
          e.target.value = ''
        }}
      />

      {!fileContext ? (
        <FileSelectStep onFileSelect={onFileSelect} parsing={parsing} />
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 text-xs bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-800 truncate">
                <strong>{fileContext.fileName}</strong> loaded — {sourceColumns.filter(Boolean).length} columns detected
              </span>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="shrink-0 px-2.5 py-1 text-emerald-800 border border-emerald-300 bg-white rounded hover:bg-emerald-100 disabled:opacity-50 font-medium"
            >
              {parsing ? 'Reading...' : 'Re-upload'}
            </button>
          </div>

          <Accordion title="Plate Summary" defaultOpen={false}>
            <PlateSummaryPanel
              plateId={plateId}
              onPlateIdChange={onPlateIdChange}
              plateIdFromFile={plateIdFromFile}
              onApplyMappings={onApplyMappings}
              applying={applying}
              plateSize={plateSize}
              onPlateSizeChange={onPlateSizeChange}
              device={ps?.device ?? fileContext.metadata.device}
              runDate={ps?.runDate ?? fileContext.metadata.runDate}
              mappedSamples={ps?.mappedSamples ?? 0}
              controls={ps?.controls ?? 0}
              errors={ps?.errors ?? 0}
            />
          </Accordion>

          <Accordion title="Raw File Data" defaultOpen={false}>
            <pre className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded overflow-x-auto font-mono whitespace-pre max-h-40">
              {fileContext.rawText}
            </pre>
          </Accordion>

          <Accordion
            key={uploadData ? 'mapped' : 'initial'}
            title="Field Mapping — map columns from your file"
            defaultOpen={false}
            variant="highlight"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              <RowSettingCard
                title="Header Row"
                description="Row in file containing column headers."
                label="Header Row:"
                value={headerRow}
                min={1}
                max={Math.max(1, totalRows)}
                disabled={applying}
                onChange={onHeaderRowChange}
              />
              <RowSettingCard
                title="Results Start Row"
                description="Row where diagnostic raw data actually begins."
                label="Data Row:"
                value={dataStartRow}
                min={headerRow + 1}
                max={Math.max(headerRow + 1, totalRows)}
                disabled={applying}
                onChange={onDataStartRowChange}
              />
            </div>
            <table className="w-full text-xs bg-white border border-slate-200 rounded overflow-hidden">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="px-2 py-1.5 text-left font-medium w-1/2">System Field</th>
                  <th className="px-2 py-1.5 text-left font-medium w-1/2">Source Column (from your file)</th>
                </tr>
              </thead>
              <tbody>
                {MAPPING_FIELD_DEFS.map((def) => {
                  const sourceColumn = userMappings.find((m) => m.key === def.key)?.sourceColumn ?? ''
                  return (
                  <tr key={def.key} className="border-b border-slate-100">
                    <td className="px-2 py-1.5 text-slate-700">
                      {def.label}
                      {def.required && <span className="text-red-500 ml-0.5">*</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={sourceColumn}
                        onChange={(e) => updateMapping(def.key, e.target.value)}
                        disabled={applying}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="">— Select column —</option>
                        {sourceColumns.filter((col) => col).map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {(applying || mappingError) && (
              <div className="mt-2 text-xs">
                {applying && <span className="text-slate-500">Updating preview…</span>}
                {mappingError && <span className="text-red-600">{mappingError}</span>}
              </div>
            )}
          </Accordion>

          <Accordion title="Preview Data" defaultOpen>
            {uploadData ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-600">{rows.length} rows parsed from your file</span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={selectAll} onChange={toggleAll} className="rounded border-slate-300 text-blue-600" />
                    Select all valid Results
                  </label>
                </div>

                <div className="border border-slate-200 rounded overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="bg-slate-700 text-white">
                        <th className="w-8 px-2 py-1.5"></th>
                        {PREVIEW_COLUMN_KEYS.map((key) => (
                          <th key={key} className="px-2 py-1.5 text-left font-medium">
                            {previewColumnLabel(key)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className={`border-b border-slate-100 ${row.validationStatus === 'Error' ? 'bg-red-50/50' : 'hover:bg-slate-50'}`}>
                          <td className="px-2 py-1.5">
                            {row.validationStatus !== 'Error' && (
                              <input type="checkbox" checked={row.selected} onChange={() => toggleRow(row.id)} className="rounded border-slate-300 text-blue-600" />
                            )}
                          </td>
                          {PREVIEW_COLUMN_KEYS.map((key) => (
                            <td key={key} className="px-2 py-1.5 text-slate-600">
                              {renderPreviewCell(row, key)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-4 text-xs text-slate-500 border border-dashed border-slate-200 rounded">
                Map <strong>Sample ID</strong>, <strong>Target Name</strong>, and <strong>Result</strong> in Field Mapping to preview data here
              </div>
            )}
          </Accordion>
        </div>
      )}
    </Modal>
  )
}
