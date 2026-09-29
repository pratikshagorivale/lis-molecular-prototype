import * as XLSX from 'xlsx'
import {
  detectLayout,
  fitPlateSizeForWells,
  indexToWell,
  parsePosition,
  toLongTable,
  type ToxLongTable,
} from './toxLongTable'
import { headerRowFor, matchTemplate, rankTemplates } from './toxTemplateMatch'
import { interpretationFor } from './toxConsistency'
import { TOX_TEMPLATE_CATALOGUE } from '../data/toxTemplates'
import { instrumentForTemplate } from '../data/toxInstruments'
import { drugsForInstrument, type ToxDrugCutOff } from '../data/toxDrugs'
import type { ToxControlConfig } from '../types/toxControl'
import { TOX_CONTROL_TYPE_TO_POSITION, interpretationForToxOperator } from '../types/toxControl'
import type {
  ColumnBinding,
  SampleTypeMap,
  TemplateFileCheck,
  ToxFileTemplate,
  ToxSystemField,
} from '../types/toxTemplate'
import {
  controlCutOff,
  controlDrugPassed,
  niceNominal,
  parseNumber,
  qcPassedFor,
  verdictFor,
  voidedByControls,
} from './toxEvaluation'
import type {
  BatchPosition,
  CalibrationCurve,
  CalibrationLevel,
  CompoundResult,
  ControlOutcome,
  Injection,
  PositionType,
  ToxBatch,
} from '../types/tox'

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

const DELIMITERS = [',', '\t', ';', '|'] as const
export type Delimiter = (typeof DELIMITERS)[number]

/**
 * Guess the delimiter from the header line.
 *
 * It cannot be assumed from the extension: a Thermo sequence CSV uses the
 * Windows locale list separator, so it is semicolon-delimited on an EU-locale
 * instrument PC, and SCIEX and Waters both ship tab-delimited files named .txt.
 */
export function detectDelimiter(text: string): Delimiter {
  const line = normaliseNewlines(text).split('\n').find((l) => l.trim() !== '') ?? ''
  let best: Delimiter = ','
  let bestCount = 0
  for (const candidate of DELIMITERS) {
    const count = line.split(candidate).length - 1
    if (count > bestCount) { best = candidate; bestCount = count }
  }
  return best
}

/**
 * Collapse every line-ending convention to '\n' before parsing. A real SCIEX
 * export has CR-only terminators and zero LF bytes, which a naive reader sees
 * as a single enormous line.
 */
export function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** Minimal RFC-4180 reader — the Shimadzu export quotes headers containing commas. */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const source = normaliseNewlines(text)
  const sep = delimiter ?? detectDelimiter(source)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1 } else { quoted = false }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === sep) { row.push(field); field = ''; continue }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += char
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Text formats, by extension. Vendors ship delimited data as .txt and .tsv. */
const TEXT_FILE = /\.(csv|txt|tsv|dat)$/i

async function readRows(file: File, template?: ToxFileTemplate): Promise<string[][]> {
  if (TEXT_FILE.test(file.name)) {
    const text = (await file.text()).replace(/^\uFEFF/, '')
    const configured = template?.read?.delimiter
    const delimiter = configured && configured !== 'auto' ? (configured as Delimiter) : undefined
    return parseCsv(text, delimiter)
  }
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = typeof template?.read?.sheet === 'string'
    ? template.read.sheet
    : workbook.SheetNames[Number(template?.read?.sheet ?? 0)] ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
  return raw.map((r) => r.map((c) => (c == null ? '' : String(c))))
}

// ---------------------------------------------------------------------------
// Shared assembly
// ---------------------------------------------------------------------------

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Two sources, and they answer different questions.
 *
 * The template knows the *format* — that a 'Sample Type' column reading 'Std.'
 * means a standard. The instrument's control configuration knows the *lab* —
 * that the injection named 'QC N' is this lab's blank. Configuration wins when
 * it names the control, because only the lab can say that.
 */
function injectionTypeFrom(
  raw: string,
  name: string,
  vocabulary: SampleTypeMap,
  controls: ToxControlConfig[],
): PositionType {
  const configured = matchControl(name, controls)
  if (configured) return TOX_CONTROL_TYPE_TO_POSITION[configured.controlType]

  const value = normalise(raw)
  const mapped = vocabulary[value]
  if (mapped) return mapped
  // A QC can also hide in the sample name when the type column says 'Unknown'.
  if (/^qc\b|\bqc$/i.test(name.trim())) return 'QC'
  return 'Sample'
}

/** The configured control an injection's sample name refers to, if any. */
export function matchControl(
  sampleName: string,
  controls: ToxControlConfig[],
): ToxControlConfig | null {
  const name = normalise(sampleName)
  if (!name) return null
  return controls.find((c) => normalise(c.control) === name) ?? null
}

function buildCurves(injections: Injection[], compounds: string[]): CalibrationCurve[] {
  const calInjections = injections.filter((i) => i.type === 'Cal')

  return compounds.map((compound) => {
    // Not every vendor exports a calibrator-level column — SCIEX states the
    // nominal concentration instead. Rank the distinct nominals to recover the
    // levels, otherwise the curve is never built and nothing can read positive.
    const nominals = [...new Set(
      calInjections
        .map((i) => i.results.find((r) => r.compound === compound)?.expected)
        .filter((v): v is number => v != null && v > 0),
    )].sort((a, b) => a - b)

    const levelOf = (injection: Injection, result: CompoundResult | undefined): number | null => {
      if (injection.level != null) return injection.level
      if (result?.expected != null) {
        const rank = nominals.indexOf(result.expected)
        if (rank >= 0) return rank + 1
      }
      return null
    }

    const byLevel = new Map<number, { expected: number[]; found: number[]; accuracy: number[] }>()
    for (const injection of calInjections) {
      const result = injection.results.find((r) => r.compound === compound)
      if (!result || result.concentration == null) continue
      const level = levelOf(injection, result)
      if (level == null) continue

      // Prefer a stated nominal; otherwise recover it from found / accuracy,
      // which is all an Agilent export gives.
      let expected = result.expected
      if (expected == null) {
        if (result.accuracy == null || result.accuracy === 0) continue
        expected = niceNominal(result.concentration / (result.accuracy / 100))
      }
      // A stated nominal also yields the recovery when the file omits it.
      const accuracy = result.accuracy ?? (expected > 0 ? (result.concentration / expected) * 100 : null)
      if (accuracy == null) continue

      const entry = byLevel.get(level) ?? { expected: [], found: [], accuracy: [] }
      if (Number.isFinite(expected)) entry.expected.push(expected)
      entry.found.push(result.concentration)
      entry.accuracy.push(accuracy)
      byLevel.set(level, entry)
    }

    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
    const levels: CalibrationLevel[] = [...byLevel.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, entry]) => ({
        level,
        expected: entry.expected.length ? niceNominal(mean(entry.expected)) : 0,
        found: mean(entry.found),
      }))

    return {
      compound,
      levels,
      lloq: levels.length ? Math.min(...levels.map((l) => l.expected)) : null,
      uloq: levels.length ? Math.max(...levels.map((l) => l.expected)) : null,
    }
  })
}

/**
 * How each configured control performed.
 *
 * A control is only evaluated if the run actually contains it — a plate that
 * skipped a QC simply has no outcome for it, which the banner shows as absent
 * rather than as a pass.
 */
function buildControlOutcomes(
  injections: Injection[],
  positionOf: Map<string, string>,
  controls: ToxControlConfig[],
): ControlOutcome[] {
  const outcomes: ControlOutcome[] = []

  for (const control of controls) {
    const matching = injections.filter(
      (i) => i.controlName.trim().toLowerCase() === control.control.trim().toLowerCase(),
    )

    // A control the lab requires that never appears in the file is a failure,
    // not an absence. Skipping it would let a plate release on a control that
    // was never run.
    if (matching.length === 0) {
      outcomes.push({
        name: control.control,
        positionId: '',
        type: TOX_CONTROL_TYPE_TO_POSITION[control.controlType],
        expected: interpretationForToxOperator(control.operator),
        failedCompounds: [],
        compoundCount: 0,
        passed: false,
        detail: 'Configured for this instrument but not found in the file',
        failureBehavior: control.failureBehavior,
      })
      continue
    }

    // Judge the control on the acquisition its well shows. A run that reads a
    // calibrator again at the end is judged on that later read, so the outcome
    // and the numbers in the drawer can never disagree.
    const read = matching.reduce((a, b) => (b.sequence > a.sequence ? b : a))
    const positionId = positionOf.get(read.injectionId) ?? ''
    const type = TOX_CONTROL_TYPE_TO_POSITION[control.controlType]

    // Only the drugs this control names, when it names any. A drug the lab set
    // no cut-off for is not judged — the control simply says nothing about it.
    const named = control.scope === 'targeted'
      ? new Set((control.drugs ?? []).map((d) => d.drug))
      : null
    const judged = read.results
      .filter((r) => !named || named.has(r.compound))
      .map((r) => ({ result: r, cutOff: controlCutOff(control, r.compound) }))
      .filter((j): j is { result: CompoundResult; cutOff: number } => j.cutOff != null)

    // Present, but the lab never said what passing means. Asserting a pass
    // would be a guess, so it reads as unjudged and fails.
    if (judged.length === 0) {
      outcomes.push({
        name: control.control,
        positionId,
        type,
        expected: interpretationForToxOperator(control.operator),
        failedCompounds: [],
        compoundCount: 0,
        passed: false,
        detail: 'No cut-off configured for the drugs this control covers',
        failureBehavior: control.failureBehavior,
      })
      continue
    }

    const failedCompounds = judged
      .filter(({ result, cutOff }) => !controlDrugPassed(result.concentration, cutOff, control.operator))
      .map(({ result }) => result.compound)

    const count = judged.length
    const noun = `drug${count === 1 ? '' : 's'}`
    const expected = interpretationForToxOperator(control.operator)
    outcomes.push({
      name: control.control,
      positionId,
      type,
      expected,
      failedCompounds,
      compoundCount: count,
      passed: failedCompounds.length === 0,
      detail: failedCompounds.length === 0
        ? `All ${count} ${noun} read ${expected}, as expected`
        : `${failedCompounds.length} of ${count} ${noun} did not read ${expected}`,
      failureBehavior: control.failureBehavior,
    })
  }

  return outcomes
}

function assembleBatch(params: {
  fileName: string
  templateId: string
  templateLabel: string
  assayRole: 'screening' | 'confirmation'
  instrument: string
  layout: 'grid' | 'rack'
  plateSize: 96 | 384 | null
  extraColumns: string[]
  injections: Injection[]
  positionOf: Map<string, { plateId: string; positionId: string; row: string; column: number; sampleId: string }>
  compounds: string[]
  unit: string
  panel: string
  controls: ToxControlConfig[]
  drugCutOffs: ToxDrugCutOff[]
  warnings: string[]
  batchId: string
  fileBatchId?: string
}): ToxBatch {
  const { injections, positionOf, compounds, warnings } = params

  const curves = buildCurves(injections, compounds)
  const curveByCompound = new Map(curves.map((c) => [c.compound, c]))

  /**
   * The reporting cut-off for a drug — the number that decides the patient
   * result. It comes from the instrument's drug list and nowhere else: not
   * from a control, and never from the run's own calibrators, which would let
   * the file decide what counts as positive.
   */
  const configuredCutOff = new Map(
    params.drugCutOffs
      .filter((d) => d.cutOff != null && d.cutOff > 0)
      .map((d) => [d.drug, d.cutOff as number]),
  )
  const cutOffFor = (compound: string) => configuredCutOff.get(compound) ?? null

  // Second pass: now that curve limits exist, the verdicts can be settled.
  for (const injection of injections) {
    const isSample = injection.type === 'Sample'
    for (const result of injection.results) {
      const curve = curveByCompound.get(result.compound)
      result.lloq = curve?.lloq ?? null
      result.uloq = curve?.uloq ?? null
      result.cutOff = cutOffFor(result.compound)

      // Only a sample can sit above the curve: a top calibrator reading at its
      // own nominal is a pass, not a dilution.
      result.verdict = verdictFor(
        result.concentration,
        result.cutOff,
        result.lloq,
        isSample ? result.uloq : null,
      )
    }
  }

  const injectionPositionIds = new Map(
    [...positionOf.entries()].map(([injectionId, p]) => [injectionId, p.positionId]),
  )
  const controlOutcomes = buildControlOutcomes(injections, injectionPositionIds, params.controls)

  // A failed control reaches exactly as far as its configuration says: voiding
  // the drugs it failed on, or failing the plate outright.
  // A drug with no configured cut-off cannot be called positive or negative,
  // so it is not reportable. Voiding it is the same mechanism a failed control
  // uses, and it keeps the interpretation binary instead of inventing a third.
  const unconfigured = compounds.filter((c) => cutOffFor(c) == null)
  if (unconfigured.length > 0) {
    warnings.push(
      `${unconfigured.length} drug${unconfigured.length === 1 ? '' : 's'} on this run have no reporting cut-off configured for ${params.instrument} and cannot be released: ${unconfigured.slice(0, 5).join(', ')}${unconfigured.length > 5 ? '…' : ''}.`,
    )
  }

  const controlVoidedCompounds = voidedByControls(controlOutcomes, compounds)
  const voidedCompounds = [...new Set([...controlVoidedCompounds, ...unconfigured])]
  const qcPassed = qcPassedFor(controlOutcomes)

  // One position, one set of results. A run that acquires the same well twice
  // — a calibrator re-read at the end of the sequence — keeps the later one.
  const latestAt = new Map<string, Injection>()
  for (const injection of injections) {
    const meta = positionOf.get(injection.injectionId)
    if (!meta) continue
    const key = `${meta.plateId}|${meta.positionId}`
    const held = latestAt.get(key)
    if (!held || injection.sequence > held.sequence) latestAt.set(key, injection)
  }

  const positions: BatchPosition[] = []
  for (const injection of latestAt.values()) {
    const meta = positionOf.get(injection.injectionId)!
    positions.push({
      positionId: meta.positionId,
      plateId: meta.plateId,
      row: meta.row,
      column: meta.column,
      sampleId: meta.sampleId,
      patient: '',
      accessionNumber: meta.sampleId,
      type: injection.type,
      level: injection.level,
      controlName: injection.controlName,
      acquiredAt: injection.acquiredAt,
      results: injection.results,
      flags: injection.flags,
      // The same cut-off call the drawer and the results table make, so the
      // count on the well always matches the rows highlighted inside it.
      positivesCount: injection.type !== 'Sample' ? 0
        : injection.results.filter((r) => interpretationFor(r) === 'Positive').length,
      requiresDilution: injection.type === 'Sample'
        && injection.results.some((r) => r.verdict === 'Over Curve'),
    })
  }

  const runDate = injections[0]?.acquiredAt ?? ''

  const batch: ToxBatch = {
    batchId: params.batchId,
    extraColumns: params.extraColumns,
    fileBatchId: params.fileBatchId,
    fileName: params.fileName,
    templateId: params.templateId,
    templateLabel: params.templateLabel,
    assayRole: params.assayRole,
    instrument: params.instrument,
    panel: params.panel,
    runDate,
    layout: params.layout,
    plateSize: params.plateSize,
    plateIds: [...new Set(positions.map((p) => p.plateId).filter(Boolean))],
    positions,
    curves,
    controlOutcomes,
    qcPassed,
    compounds,
    voidedCompounds,
    controlVoidedCompounds,
    unit: params.unit,
    status: 'Pending',
    warnings,
  }

  if (/^DEMO_/i.test(params.fileName)) {
    warnings.unshift('Constructed demo file — control values were edited to exercise a failure path. Not real instrument output.')
  }

  return batch
}

// ---------------------------------------------------------------------------
// Building a batch from the long table, entirely from the template
// ---------------------------------------------------------------------------

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Resolve one template binding against the columns a file actually has.
 *
 * `pattern` exists because some vendors name the result column after the
 * units — the header is literally 'ng/mL' and changes with the method — so
 * there is no fixed name to match on.
 */
export function resolveBinding(binding: ColumnBinding | undefined, columns: string[]): string {
  if (!binding || binding.kind === 'none') return ''
  if (binding.kind === 'exact') {
    return columns.find((c) => norm(c) === norm(binding.column)) ?? ''
  }
  if (binding.kind === 'alias') {
    for (const alias of binding.aliases) {
      const found = columns.find((c) => norm(c) === norm(alias))
      if (found) return found
    }
    return ''
  }
  const pattern = new RegExp(binding.pattern, 'i')
  return columns.find((c) => pattern.test(c)) ?? ''
}

/** Every system field the template can bind, resolved to a real column name. */
export function resolveTemplateFields(
  template: ToxFileTemplate,
  columns: string[],
): Partial<Record<ToxSystemField, string>> {
  const resolved: Partial<Record<ToxSystemField, string>> = {}
  for (const [key, binding] of Object.entries(template.fields)) {
    const column = resolveBinding(binding as ColumnBinding, columns)
    if (column) resolved[key as ToxSystemField] = column
  }
  return resolved
}

/**
 * Turn a sequential vial number into a well, when the template says the run
 * was plated. Left alone, an autosampler rack stays a rack.
 */
function applyFill(
  parsed: ReturnType<typeof parsePosition>,
  template: ToxFileTemplate,
): ReturnType<typeof parsePosition> {
  if (template.position.fill !== 'row-major') return parsed
  const index = Number(parsed.positionId)
  if (!Number.isFinite(index)) return parsed
  const size = template.plateSize === 'auto' ? 96 : (template.plateSize as 96 | 384)
  const well = indexToWell(index, size === 384 ? 384 : 96)
  if (!well) return parsed
  return { ...parsed, positionId: well.well, row: well.row, column: well.column }
}

/**
 * Build a plate address from whatever columns the template nominates, joined
 * and matched against its pattern. This covers all three vendor models: one
 * combined string with the plate embedded, two columns, or three numerics.
 */
function positionFromTemplate(
  record: Record<string, string>,
  template: ToxFileTemplate,
  /** The mapped well/plate columns, used when the template names none. */
  fallback: { wellColumn: string; plateColumn: string },
): ReturnType<typeof parsePosition> {
  const { position } = template

  // A template that names no position columns falls back to the mapped Well
  // Position and Plate fields. Without this a new template silently collapses
  // every injection onto one empty position, which parses but is nonsense.
  const columns = position.columns.length > 0
    ? position.columns
    : [fallback.plateColumn, fallback.wellColumn].filter(Boolean)

  if (position.columns.length === 0) {
    const plate = fallback.plateColumn ? (record[fallback.plateColumn] ?? '').trim() : ''
    const well = fallback.wellColumn ? (record[fallback.wellColumn] ?? '').trim() : ''
    const label = plate && position.plateLabel
      ? position.plateLabel.replace('{plate}', plate)
      : plate
    return applyFill(parsePosition(well, label || undefined), template)
  }

  const parts = columns.map((c) => (record[c] ?? '').trim())
  const joined = parts.join(position.join ?? '')

  const label = (plate: string) =>
    plate && position.plateLabel ? position.plateLabel.replace('{plate}', plate) : plate

  if (position.pattern) {
    const match = joined.match(new RegExp(position.pattern))
    if (match?.groups) {
      const groups = match.groups
      const plate = label((groups.plate ?? '').trim())
      const well = (groups.well ?? `${groups.row ?? ''}${groups.col ?? ''}`).trim()
      // parsePosition normalises the well and derives row/column from it.
      const parsed = parsePosition(well, plate || undefined)
      return applyFill(plate ? { ...parsed, plateId: plate } : parsed, template)
    }
  }
  // No pattern, or it did not match: fall back to splitting a combined value.
  return applyFill(parsePosition(joined), template)
}

/** A panel's deuterated standards are rarely all referenced by ISTD Name. */
const ISTD_NAME_PATTERN = /[\s-](d\d{1,2}(c13)?|13c\d?|is)$/i

export function buildToxBatchFromTable(
  fileName: string,
  table: ToxLongTable,
  template: ToxFileTemplate,
  /** The instrument's configured controls, from Instrument Management. */
  controls: ToxControlConfig[] = [],
  panelName: string | undefined = undefined,
  /** The instrument's reporting cut-offs. Defaults to the template's panel. */
  drugCutOffs: ToxDrugCutOff[] = drugsForInstrument(template.id),
): ToxBatch {
  // Every binding comes from the template. There is no mapping step, so a file
  // that does not fit is rejected up front rather than half-parsed — see
  // checkFileAgainstTemplate.
  const templateColumns = resolveTemplateFields(template, table.columns)
  const columnOf = (key: ToxSystemField) => templateColumns[key] ?? ''
  const cell = (record: Record<string, string>, key: ToxSystemField) => {
    const column = columnOf(key)
    return column ? (record[column] ?? '').trim() : ''
  }
  const field = cell

  const mappedColumns = new Set(Object.values(templateColumns).filter(Boolean))
  const extraColumns = table.columns.filter((c) => !mappedColumns.has(c))

  const istdNames = new Set(
    table.records.map((r) => cell(r, 'istdName')).filter(Boolean),
  )
  const isInternalStandard = (compound: string) =>
    istdNames.has(compound) || ISTD_NAME_PATTERN.test(compound)

  // One injection per unique analysis. Data File is unique per injection in both
  // vendors; without it, sample + position + time still separates repeat runs.
  const grouped = new Map<string, Record<string, string>[]>()
  for (const record of table.records) {
    const compound = field(record, 'drugName')
    if (!compound) continue
    const key = cell(record, 'injectionId')
      || `${field(record, 'sampleId')}|${field(record, 'wellPosition')}|${field(record, 'acquired')}`
    grouped.set(key, [...(grouped.get(key) ?? []), record])
  }

  const compounds: string[] = []
  const injections: Injection[] = []
  const positionOf = new Map<string, { plateId: string; positionId: string; row: string; column: number; sampleId: string }>()
  let instrument = ''
  let unit = ''
  let acquisitionBatch = ''
  let sequence = 0

  for (const [injectionId, rows] of grouped) {
    const first = rows[0]
    const sampleId = field(first, 'sampleId')
    const type = injectionTypeFrom(
      field(first, 'injectionType'), sampleId, template.sampleTypes, controls,
    )
    const configuredControl = matchControl(sampleId, controls)
    if (!instrument) instrument = cell(first, 'instrument')
    if (!acquisitionBatch) acquisitionBatch = cell(first, 'acquisitionBatch')

    const results: CompoundResult[] = []
    for (const record of rows) {
      const compound = field(record, 'drugName')
      if (!compound || isInternalStandard(compound)) continue
      if (!compounds.includes(compound)) compounds.push(compound)

      const rowUnit = cell(record, 'unit')
      if (rowUnit && !unit) unit = rowUnit

      const setRatio = parseNumber(cell(record, 'ionRatioSet'))
      const actualRatio = parseNumber(cell(record, 'ionRatioActual'))
      const ratioDiff = parseNumber(cell(record, 'ionRatioDiff'))

      const extras: Record<string, string> = {}
      for (const column of extraColumns) {
        const value = record[column]
        if (value) extras[column] = value
      }

      results.push({
        compound,
        concentration: parseNumber(field(record, 'result')),
        unit: rowUnit,
        retentionTime: parseNumber(cell(record, 'retentionTime')),
        accuracy: parseNumber(field(record, 'accuracy')),
        expected: parseNumber(cell(record, 'expectedConcentration')),
        cutOff: null,
        lloq: null,
        uloq: null,
        verdict: 'Negative',
        istdArea: parseNumber(cell(record, 'istdArea')),
        ionRatio: setRatio != null && actualRatio != null
          ? { set: setRatio, actual: actualRatio, percentDiff: ratioDiff ?? 0 }
          : null,
        signalToNoise: parseNumber(cell(record, 'signalToNoise')),
        flags: cell(record, 'flags').split(':').map((f) => f.trim()).filter(Boolean),
        extras,
      })
    }

    const acquired = field(first, 'acquired')
    injections.push({
      injectionId,
      sequence: sequence += 1,
      type,
      // A configured calibrator states its own level; not every export has one.
      level: parseNumber(configuredControl?.level ?? '') ?? parseNumber(field(first, 'level')),
      controlName: sampleId,
      acquiredAt: acquired,
      results,
      // The vendor packs several codes into one cell — 'IR: RRT%: SN' — so
      // split them the same way the per-drug rows do, or the position ends up
      // holding composite strings that match nothing.
      flags: [...new Set(
        rows.flatMap((r) => cell(r, 'flags').split(':').map((f) => f.trim()).filter(Boolean)),
      )].sort(),
    })

    positionOf.set(injectionId, {
      ...positionFromTemplate(first, template, {
        wellColumn: columnOf('wellPosition'),
        plateColumn: columnOf('plateId'),
      }),
      sampleId,
    })
  }

  // Acquisition order drives bracketing, so sort by time when the file gives one.
  if (injections.every((i) => !Number.isNaN(Date.parse(i.acquiredAt)))) {
    injections.sort((a, b) => Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt))
  }
  injections.forEach((injection, i) => { injection.sequence = i })

  const warnings: string[] = []
  if (unit === 'mg/dL') {
    warnings.push('Every compound is reported as mg/dL, including analytes calibrated at ng/mL concentrations. Confirm the method template units before release.')
  }

  // '15SEP2026_LCMS6_MP_001_014.d' → instrument LCMS6, acquisition batch MP-001.
  // Only when the id is a real data-file name: where the template binds no
  // injection id we synthesise one, and splitting that on '_' yields nonsense.
  let derivedBatch = ''
  const hasInjectionIdColumn = Boolean(columnOf('injectionId'))
  const firstInjectionId = injections[0]?.injectionId ?? ''
  if (hasInjectionIdColumn) {
    const parts = firstInjectionId.replace(/\.d$/i, '').split('_')
    if (!instrument && parts.length >= 2) instrument = parts[1]
    if (parts.length >= 4) derivedBatch = `${parts[2]}-${parts[3]}`
  }

  const fileBatchMatch = fileName.match(/([A-Z]+)_(\d+)\.[a-z]+$/i)
  const fileBatchId = fileBatchMatch ? `${fileBatchMatch[1]}-${fileBatchMatch[2]}` : undefined
  const internalBatch = acquisitionBatch || derivedBatch
  const batchId = internalBatch || fileBatchId || fileName.replace(/\.[a-z]+$/i, '')

  if (fileBatchId && internalBatch && fileBatchId !== internalBatch) {
    warnings.push(`Filename batch ${fileBatchId} disagrees with the acquisition batch ${internalBatch} in the data files. Using the acquisition batch.`)
  }

  const positionIds = [...positionOf.values()].map((p) => p.positionId)
  const layout = detectLayout(positionIds)
  // Only a grid has a plate size; a rack is drawn as vials.
  const plateSize = layout === 'grid'
    ? (template.plateSize !== 'auto' && template.plateSize !== 1536
        ? (template.plateSize as 96 | 384)
        : fitPlateSizeForWells(positionIds))
    : null

  return assembleBatch({
    fileName,
    templateId: template.id,
    templateLabel: template.label,
    assayRole: template.assayRole,
    // Fall back to what the parser knows about the device, not to a guess.
    instrument: instrument || template.vendorHint || 'Unknown LC-MS/MS',
    layout,
    plateSize,
    extraColumns,
    injections,
    positionOf,
    compounds,
    unit: unit || 'ng/mL',
    panel: panelName || 'Toxicology panel',
    controls,
    drugCutOffs,
    warnings,
    batchId,
    // Only a genuine disagreement: when the file states no batch of its own,
    // the filename is simply the source, not a conflict.
    fileBatchId: fileBatchId && internalBatch && fileBatchId !== internalBatch
      ? fileBatchId
      : undefined,
  })
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Parse with the best-matching template, for callers that do not pick one. */
export function buildToxBatch(
  fileName: string,
  rows: string[][],
  template?: ToxFileTemplate,
  controls: ToxControlConfig[] = [],
  panelName?: string,
  drugCutOffs?: ToxDrugCutOff[],
): ToxBatch {
  const resolved = template ?? matchTemplate(rows, fileName)
  if (!resolved) {
    throw new Error(`No parser in the catalogue recognises ${fileName}.`)
  }
  return buildToxBatchFromTable(
    fileName,
    toLongTable(rows, resolved),
    resolved,
    controls,
    panelName ?? instrumentForTemplate(resolved.id)?.panel,
    drugCutOffs,
  )
}

/**
 * Load one of the demo exports.
 *
 * The instrument is only known once the file is read, and its controls are
 * configured against that instrument — so read the file, then build again with
 * the controls the lab configured for whatever device wrote it.
 */
export async function loadToxDemoBatch(
  fileName: string,
  configFor?: (instrumentName: string) => {
    controls: ToxControlConfig[]
    drugCutOffs?: ToxDrugCutOff[]
  },
  catalogue: ToxFileTemplate[] = TOX_TEMPLATE_CATALOGUE,
): Promise<ToxBatch> {
  const response = await fetch(`${import.meta.env.BASE_URL}demo/tox/${fileName}`)
  if (!response.ok) throw new Error(`Could not load ${fileName}`)
  const text = (await response.text()).replace(/^\uFEFF/, '')
  const rows = parseCsv(text)
  const template = matchTemplate(rows, fileName, catalogue) ?? undefined
  const batch = buildToxBatch(fileName, rows, template)
  const config = configFor?.(batch.instrument)
  if (!config || (config.controls.length === 0 && !config.drugCutOffs)) return batch
  return buildToxBatch(fileName, rows, template, config.controls, undefined, config.drugCutOffs)
}

/**
 * Narrow a batch to the positions the technologist ticked. Controls are always
 * kept: QC belongs to the run, not to the selection, so dropping them would
 * make the remaining samples unreadable.
 */
export function filterToxBatchByPositions(batch: ToxBatch, selected: Set<string>): ToxBatch {
  const positions = batch.positions.filter(
    (position) => position.type !== 'Sample' || selected.has(position.positionId),
  )
  return { ...batch, positions }
}

// ---------------------------------------------------------------------------
// Upload: pick a parser, check the file fits, read it
// ---------------------------------------------------------------------------

export interface ToxFileContext {
  fileName: string
  /** The parser this file was read with. */
  template: ToxFileTemplate
  /** First lines of the file, for the Raw File Data panel. */
  rawText: string
  sourceColumns: string[]
  table: ToxLongTable
  /** Kept so another parser can be tried without re-reading the file. */
  rows: string[][]
}

export interface ToxReadResult {
  context: ToxFileContext
  check: TemplateFileCheck
}

const emptyTable = (template: ToxFileTemplate): ToxLongTable => ({
  templateId: template.id,
  templateLabel: template.label,
  columns: [],
  records: [],
  rawText: '',
})

/**
 * Does the chosen parser fit this file?
 *
 * With no mapping step, this is the only gate between a mismatched file and a
 * confidently wrong batch — so it names the columns that are missing and points
 * at the parser that would have worked.
 */
export function checkFileAgainstTemplate(
  rows: string[][],
  fileName: string,
  template: ToxFileTemplate,
  catalogue: ToxFileTemplate[] = TOX_TEMPLATE_CATALOGUE,
): TemplateFileCheck {
  const header = headerRowFor(rows, template).map((c) => c.trim()).filter(Boolean)
  const present = new Set(header.map((c) => c.toLowerCase()))
  const required = template.match.requiredColumns ?? []
  const missingColumns = required.filter((c) => !present.has(c.toLowerCase()))

  if (missingColumns.length === 0) {
    return { ok: true, missingColumns: [], detail: `Read with the ${template.label} parser.` }
  }

  // Picking the wrong parser is the common mistake. Say which one fits rather
  // than making the technologist try each in turn.
  const suggestion = rankTemplates(rows, fileName, catalogue)
    .find((m) => m.template.id !== template.id)?.template

  return {
    ok: false,
    missingColumns,
    suggestion,
    detail: suggestion
      ? `This file does not match ${template.label}. It looks like a ${suggestion.label} export.`
      : `This file does not match ${template.label}, and no other parser recognises it either.`,
  }
}

function contextFor(
  fileName: string,
  rows: string[][],
  template: ToxFileTemplate,
  ok: boolean,
): ToxFileContext {
  if (!ok) {
    return { fileName, template, rawText: '', sourceColumns: [], table: emptyTable(template), rows }
  }
  const table = toLongTable(rows, template)
  return {
    fileName,
    template,
    rawText: table.rawText,
    sourceColumns: table.columns,
    table,
    rows,
  }
}

/** Read a picked file with the chosen parser, and say whether it fits. */
export async function readToxFile(
  file: File,
  template: ToxFileTemplate,
  catalogue: ToxFileTemplate[] = TOX_TEMPLATE_CATALOGUE,
): Promise<ToxReadResult> {
  const rows = await readRows(file, template)
  const check = checkFileAgainstTemplate(rows, file.name, template, catalogue)
  return { check, context: contextFor(file.name, rows, template, check.ok) }
}

/** Try an already-loaded file against a different parser. */
export function applyTemplate(
  context: ToxFileContext,
  template: ToxFileTemplate,
  catalogue: ToxFileTemplate[] = TOX_TEMPLATE_CATALOGUE,
): ToxReadResult {
  const check = checkFileAgainstTemplate(context.rows, context.fileName, template, catalogue)
  return { check, context: contextFor(context.fileName, context.rows, template, check.ok) }
}
