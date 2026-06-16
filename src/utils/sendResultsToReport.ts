import { isControlSample } from '../data/lisSampleRegistry'
import { buildMolecularReport } from '../data/reportEntryMockData'
import { formatInterpretationDisplay } from './interpretation'
import type { MolecularReportData, ParsedUploadData, PreviewRow, ReportResultRow, WaitingListEntry } from '../types'

const RESISTANCE_GENE = /^(bla|dfr|van|mec|amp[cC]|ctx)/i

const GENE_ABX_NAMES: Record<string, string> = {
  blaTEM: 'Pivampicillin',
  'blaCTX-M': 'Ceftazidime',
  'blaNDM-1': 'Meropenem',
  blaKPC: 'Pristinamycin',
  blaVIM: 'Imipenem',
  vanA: 'Vancomycin',
  dfrA: 'Trimethoprim',
  mecA: 'Oxacillin',
}

function interpretationLabel(row: PreviewRow): string {
  return formatInterpretationDisplay(row.interpretation, row.ampStatus)
}

function resultValue(row: PreviewRow): string {
  const ct = row.ctValue
  if (ct === '' || ct == null || ct === '-') return ''
  return String(ct)
}

function primarySampleId(rows: PreviewRow[]): string {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r.isQc || isControlSample(r.sampleId)) continue
    counts.set(r.sampleId, (counts.get(r.sampleId) ?? 0) + 1)
  }
  let best = ''
  let max = 0
  for (const [id, n] of counts) {
    if (n > max) {
      max = n
      best = id
    }
  }
  return best
}

function clinicalRowsForSample(rows: PreviewRow[], sampleId: string): PreviewRow[] {
  const seen = new Set<string>()
  const out: PreviewRow[] = []
  for (const row of rows) {
    if (row.isQc || isControlSample(row.sampleId)) continue
    if (row.sampleId !== sampleId) continue
    const key = row.targetName.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

function toReportRow(row: PreviewRow, id: string, cutOff = '0'): ReportResultRow {
  return {
    id,
    name: row.targetName,
    cutOff,
    result: resultValue(row),
    interpretation: interpretationLabel(row),
    viralLoad: row.viralLoad || '',
    antibioticName: '',
  }
}

export function resolveWaitingEntryForUpload(
  data: ParsedUploadData,
  queue: WaitingListEntry[],
): WaitingListEntry {
  const patientRow = data.previewRows.find((r) => r.patient && !r.isQc)
  if (patientRow?.patient) {
    const first = patientRow.patient.split(' ')[0]?.toLowerCase()
    const byPatient = queue.find((e) => e.patientName.toLowerCase().includes(first))
    if (byPatient) return byPatient
  }

  const sampleId = primarySampleId(data.previewRows)
  if (sampleId) {
    const bySample = queue.find((e) => e.sampleId === sampleId)
    if (bySample) return bySample
  }

  const uti = queue.find((e) => /urinary|uti/i.test(e.service))
  return uti ?? queue[0]
}

export function buildMolecularReportFromUpload(
  entry: WaitingListEntry,
  previewRows: PreviewRow[],
): MolecularReportData {
  const base = buildMolecularReport(entry)
  const sampleId = primarySampleId(previewRows) || entry.sampleId
  const targets = clinicalRowsForSample(previewRows, sampleId)

  const genes: ReportResultRow[] = []
  const organisms: ReportResultRow[] = []
  const antibioticResistance: ReportResultRow[] = []

  targets.forEach((row, i) => {
    const isResistanceGene = row.type === 'Gene' && RESISTANCE_GENE.test(row.targetName)
    const isGene = row.type === 'Gene' && !isResistanceGene
    const isOrganism = row.type === 'Organism'

    if (isResistanceGene) {
      const abxName = GENE_ABX_NAMES[row.targetName] ?? GENE_ABX_NAMES[row.targetName.replace(/-.*/, '')] ?? '—'
      antibioticResistance.push({
        ...toReportRow(row, `abx-${i}`, '10'),
        antibioticName: abxName,
        result: resultValue(row) || (row.interpretation === 'Detected' ? '-' : ''),
      })
    } else if (isGene) {
      genes.push(toReportRow(row, `gene-${i}`, '10'))
    } else if (isOrganism) {
      organisms.push(toReportRow(row, `org-${i}`))
    }
  })

  const patientRow = previewRows.find((r) => r.sampleId === sampleId && r.patient)

  return {
    ...base,
    status: 'Partially Completed',
    sampleId,
    patientName: patientRow?.patient || entry.patientName,
    genes: genes.length > 0 ? genes : base.genes,
    organisms: organisms.length > 0 ? organisms : base.organisms,
    antibioticResistance: antibioticResistance.length > 0 ? antibioticResistance : base.antibioticResistance,
  }
}
