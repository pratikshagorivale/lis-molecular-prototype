import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAutoMappings,
  readSpreadsheetFile,
  recordsFromMappings,
  type RawMolecularRow,
} from '../src/utils/parseMolecularFile'
import { buildValidationData } from '../src/data/buildValidationData'
import {
  classifyControlType,
  evaluateControlsOfType,
  evaluatePlateQc,
  isControlRecord,
} from '../src/utils/qcDetection'
import { normalizeWell } from '../src/utils/wellPosition'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const demoPath = path.join(__dirname, '../public/demo/QS5_UTI_28OCT2024_MU1.csv')

async function parseDemoFile(): Promise<RawMolecularRow[]> {
  const buffer = fs.readFileSync(demoPath)
  const file = new File([buffer], 'QS5_UTI_28OCT2024_MU1.csv', { type: 'text/csv' })
  const context = await readSpreadsheetFile(file)
  const headerRow = context.rawRows[context.headerRowIndex] ?? []
  const sourceColumns = headerRow.map((h) => String(h ?? '').trim())
  const headers = sourceColumns.map((h) => h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' '))
  const mappings = createAutoMappings(headers, sourceColumns)
  return recordsFromMappings(context, mappings)
}

function logMisclassifiedWells(records: RawMolecularRow[], type: string) {
  const byWell = new Map<string, RawMolecularRow[]>()
  for (const row of records) {
    const wellId = normalizeWell(row.well)
    if (!wellId) continue
    const list = byWell.get(wellId) ?? []
    list.push(row)
    byWell.set(wellId, list)
  }

  console.log(`\n--- Wells classified as ${type} (including non-control) ---`)
  for (const [wellId, rows] of byWell) {
    const typeFound = rows.map((r) => classifyControlType(r)).find(Boolean)
    if (typeFound === type) {
      const isCtrl = rows.some((r) => isControlRecord(r))
      console.log(`  ${wellId}: isControl=${isCtrl}, sampleId=${rows[0].sampleId}, targets=${rows.map((r) => r.target).join(', ')}`)
    }
  }
}

function makeSimulatedRecords(): RawMolecularRow[] {
  const base = (well: string, sampleId: string, target: string, ct: number, amp: string, isQc: boolean, qcType: string): RawMolecularRow => ({
    well,
    sampleId,
    patient: '',
    testOrder: '',
    panel: isQc ? 'Control' : 'UTI Panel',
    isQc,
    qcType,
    target,
    ct,
    ampStatus: amp,
    interpretation: isQc ? 'Passed' : (amp === 'Amp' ? 'Detected' : 'Not Detected'),
    type: isQc ? 'Control' : 'Gene',
  })

  return [
    base('G12', 'PC', 'PC-FAM', 22, 'Pass', true, 'PC'),
    base('G12', 'PC', 'PC-VIC', 23, 'Pass', true, 'PC'),
    base('A4', 'NC', 'Negative Control', 0, 'Pass', true, 'NC'),
    base('A5', 'NC', 'Negative Control', 0, 'Pass', true, 'NC'),
    base('A1', '000727425', 'Escherichia coli', 20, 'Amp', false, ''),
    base('A6', '000727425', 'blaKPC', 30, 'Amp', false, ''),
  ]
}

async function main() {
  console.log('=== Demo file QC evaluation ===')
  const demoRecords = await parseDemoFile()
  const demoQc = evaluatePlateQc(demoRecords)
  console.log('evaluatePlateQc:', JSON.stringify(demoQc, null, 2))

  const built = buildValidationData({
    records: demoRecords,
    fileName: 'demo.csv',
    rawText: '',
    fieldMappings: [],
    device: 'QS5',
    plateId: 'MU1',
    runDate: '2024-10-28',
    plateViewReadiness: { canFormPlate: true, wellColumnMapped: true, plateIdAvailable: true },
  })
  console.log('qcBanner:', JSON.stringify(built.qcBanner, null, 2))

  for (const t of ['PC', 'NC', 'NTC', 'IC'] as const) {
    console.log(`evaluateControlsOfType(${t}):`, evaluateControlsOfType(demoRecords, t))
  }

  logMisclassifiedWells(demoRecords, 'IC')
  logMisclassifiedWells(demoRecords, 'PC')
  logMisclassifiedWells(demoRecords, 'NC')

  console.log('\n=== Simulated user scenario (G12 PC, A4/A5 NC, no NTC) ===')
  const simRecords = makeSimulatedRecords()
  const simQc = evaluatePlateQc(simRecords)
  console.log('evaluatePlateQc:', JSON.stringify(simQc, null, 2))

  console.log('\n=== Bug repro: sample wells with IC targets + unmarked PC well ===')
  const bugRepro: RawMolecularRow[] = [
    ...makeSimulatedRecords().filter((r) => r.well !== 'G12'),
    {
      well: 'G12',
      sampleId: '',
      patient: '',
      testOrder: '',
      panel: 'Control',
      isQc: false,
      qcType: '',
      target: 'PC-FAM',
      ct: 22,
      ampStatus: 'Pass',
      interpretation: 'Passed',
      type: 'Control',
    },
    {
      well: 'G12',
      sampleId: '',
      patient: '',
      testOrder: '',
      panel: 'Control',
      isQc: false,
      qcType: '',
      target: 'PC-VIC',
      ct: 23,
      ampStatus: 'Pass',
      interpretation: 'Passed',
      type: 'Control',
    },
    {
      well: 'B1',
      sampleId: '000727420',
      patient: 'John',
      testOrder: 'TO-1',
      panel: 'UTI Panel',
      isQc: false,
      qcType: '',
      target: 'IC',
      ct: 25,
      ampStatus: 'Amp',
      interpretation: 'Detected',
      type: 'Gene',
    },
    {
      well: 'B2',
      sampleId: '000727431',
      patient: 'Maria',
      testOrder: 'TO-2',
      panel: 'UTI Panel',
      isQc: false,
      qcType: '',
      target: 'Internal Control',
      ct: 26,
      ampStatus: 'Amp',
      interpretation: 'Detected',
      type: 'Gene',
    },
  ]
  const bugQc = evaluatePlateQc(bugRepro)
  console.log('evaluatePlateQc:', JSON.stringify(bugQc, null, 2))
  console.log('ic wells:', evaluateControlsOfType(bugRepro, 'IC'))
  console.log('pc wells:', evaluateControlsOfType(bugRepro, 'PC'))

  console.log('\n=== User scenario: G12 PC + A4/A5 NC + sample IC wells, no NTC ===')
  const userScenario = [
    ...makeSimulatedRecords(),
    {
      well: 'B1',
      sampleId: '000727420',
      patient: 'John',
      testOrder: 'TO-1',
      panel: 'UTI Panel',
      isQc: false,
      qcType: '',
      target: 'IC',
      ct: 25,
      ampStatus: 'Amp',
      interpretation: 'Detected',
      type: 'Gene',
    },
    {
      well: 'B2',
      sampleId: '000727431',
      patient: 'Maria',
      testOrder: 'TO-2',
      panel: 'UTI Panel',
      isQc: false,
      qcType: '',
      target: 'Internal Control',
      ct: 26,
      ampStatus: 'Amp',
      interpretation: 'Detected',
      type: 'Gene',
    },
  ]
  const userQc = evaluatePlateQc(userScenario)
  console.log('evaluatePlateQc:', JSON.stringify(userQc, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
