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

function emptyRow(
  id: string,
  name: string,
  cutOff: string,
  extras?: Partial<Pick<ReportResultRow, 'viralLoad' | 'antibioticName' | 'result'>>,
): ReportResultRow {
  return {
    id,
    name,
    cutOff,
    result: extras?.result ?? '',
    interpretation: '',
    viralLoad: extras?.viralLoad ?? '',
    antibioticName: extras?.antibioticName ?? '',
  }
}

export function buildMolecularReport(entry: WaitingListEntry): MolecularReportData {
  const isRespiratory = /respiratory/i.test(entry.service)
  const organisms = (isRespiratory ? RESPIRATORY_ORGANISMS : UTI_ORGANISMS).map((o, i) =>
    emptyRow(`org-${i}`, o.name, o.cutOff),
  )

  return {
    reportTitle: 'Molecular reporting',
    status: 'Incomplete',
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
    genes: [emptyRow('gene-1', 'Gene P', '10')],
    organisms,
    antibioticResistance: [
      emptyRow('abx-1', 'Gene P', '10', { result: '-', antibioticName: 'Pivampicillin' }),
      emptyRow('abx-2', 'Gene P', '10', { result: '-', antibioticName: 'Pristinamycin' }),
    ],
  }
}
