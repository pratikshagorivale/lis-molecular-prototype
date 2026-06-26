/** CT cutoff values from the target master — read-only in control configuration. */
const TARGET_CT_CUTOFF: Record<string, string> = {
  'Escherichia coli': '35',
  'Klebsiella pneumoniae': '35',
  'Enterococcus faecalis': '36',
  'Proteus mirabilis': '35',
  'Staphylococcus aureus': '34',
  'blaTEM': '32',
  'blaCTX-M': '33',
  'blaNDM-1': '34',
  'vanA': '33',
  'mecA': '32',
}

export function getTargetCtCutOff(target: string): string {
  return TARGET_CT_CUTOFF[target] ?? '—'
}
