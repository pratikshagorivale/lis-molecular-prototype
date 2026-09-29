/**
 * The toxicology plates that ship with the prototype.
 *
 * A registry plate records what a run produced, not the run itself, so a plate
 * can only be reopened when its export is still to hand. These four are; a
 * plate from an uploaded file is not, and has to be uploaded again.
 */
export interface ToxDemoPlate {
  plateId: string
  instrument: string
  fileName: string
}

export const TOX_DEMO_PLATES: ToxDemoPlate[] = [
  { plateId: 'MP-001', instrument: 'LCMS6', fileName: '15SEP2026_LCMS6_MP_301.csv' },
  { plateId: 'DL-001', instrument: 'LCMS6', fileName: '15SEP2026_LCMS6_DL_001.csv' },
  { plateId: 'ETH-004', instrument: 'LCMS5', fileName: '15SEP2026_LCMS5_ETH_104.csv' },
  { plateId: 'Frankenstein+_091526_C+Q', instrument: 'Orion (S9)', fileName: 'frank091526p2_full.csv' },
]

export function demoFileForPlate(plateId: string): string | undefined {
  return TOX_DEMO_PLATES.find(
    (p) => p.plateId.toUpperCase() === plateId.trim().toUpperCase(),
  )?.fileName
}
