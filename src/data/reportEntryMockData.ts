import type { MolecularReportData, ReportResultRow, WaitingListEntry } from '../types'

const UTI_ORGANISMS = [
  { name: 'Enterobacteriaceae', cutOff: '0' },
  { name: 'Acinetobacter spp', cutOff: '0' },
  { name: 'Organisms APDNodd', cutOff: '0' },
]

const RESPIRATORY_ORGANISMS = [
  { name: 'Streptococcus pneumoniae', cutOff: '0' },
  { name: 'Haemophilus influenzae', cutOff: '0' },
  { name: 'Moraxella catarrhalis', cutOff: '0' },
]

const ANTIBIOTICS = ['Pivampicillin', 'Pristinamycin']

/** Stable per sample, so a report reads the same every time it is opened. */
function seedFor(sampleId: string): number {
  return [...sampleId].reduce((total, char) => total + char.charCodeAt(0), 0)
}

function ctValue(seed: number, index: number): number {
  return 18 + ((seed + index * 7) % 15)
}

function isDetected(seed: number, index: number): boolean {
  return (seed + index) % 3 !== 0
}

/** Copies/mL, reported only where the organism amplified. */
function viralLoadFor(seed: number, index: number): string {
  const mantissa = 1 + ((seed + index * 3) % 9)
  const decimal = (seed + index) % 10
  return `${mantissa}.${decimal} × 10⁵ copies/mL`
}

function resultRow(
  id: string,
  name: string,
  cutOff: string,
  extras?: Partial<Pick<ReportResultRow, 'result' | 'interpretation' | 'viralLoad' | 'antibioticName'>>,
): ReportResultRow {
  return {
    id,
    name,
    cutOff,
    result: extras?.result ?? '',
    interpretation: extras?.interpretation ?? '',
    viralLoad: extras?.viralLoad ?? '',
    antibioticName: extras?.antibioticName ?? '',
  }
}

export function buildMolecularReport(entry: WaitingListEntry): MolecularReportData {
  const isRespiratory = /respiratory/i.test(entry.service)
  const seed = seedFor(entry.sampleId)

  const organisms = (isRespiratory ? RESPIRATORY_ORGANISMS : UTI_ORGANISMS).map((organism, i) => {
    const detected = isDetected(seed, i)
    return resultRow(`org-${i}`, organism.name, organism.cutOff, {
      result: detected ? String(ctValue(seed, i)) : 'Undetermined',
      interpretation: detected ? 'Detected' : 'Not Detected',
      viralLoad: detected ? viralLoadFor(seed, i) : '',
    })
  })

  const geneDetected = isDetected(seed, 7)
  const genes = [
    resultRow('gene-1', 'Gene P', '10', {
      result: geneDetected ? String(ctValue(seed, 7)) : 'Undetermined',
      interpretation: geneDetected ? 'Detected' : 'Not Detected',
    }),
  ]

  const antibioticResistance = ANTIBIOTICS.map((antibiotic, i) => {
    const resistant = isDetected(seed, i + 11)
    return resultRow(`abx-${i + 1}`, 'Gene P', '10', {
      result: resistant ? String(ctValue(seed, i + 11)) : 'Undetermined',
      interpretation: resistant ? 'Resistant' : 'Sensitive',
      antibioticName: antibiotic,
    })
  })

  return {
    reportTitle: 'Molecular reporting',
    status: 'Partially Completed',
    sampleId: entry.sampleId,
    patientName: entry.patientName,
    patientMeta: entry.patientMeta.replace('Female', 'F').replace('Male', 'M').replace(' - ', ' - '),
    patientRef: `#${entry.accessionNo.slice(-4)} (Ref: ${entry.id.padStart(4, '0')})`,
    accessionDate: entry.lastUpdated,
    billDate: entry.lastUpdated.replace(/\d{1,2}:\d{2} [AP]M/, '').trim() + '8:56 PM',
    billedBy: 'Pratikshaa',
    billId: String(6900 + Number(entry.id)),
    orderNo: '-',
    organization: `${entry.account.toUpperCase()} (Contact: 8087443919)`,
    referralName: `${entry.provider.includes('SELF') ? 'SELF' : entry.provider} (Contact: 7865567788)`,
    genes,
    organisms,
    antibioticResistance,
  }
}
