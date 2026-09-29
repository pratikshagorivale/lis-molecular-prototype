import { TOX_TEMPLATE_CATALOGUE } from './toxTemplates'
import type { ToxFileTemplate } from '../types/toxTemplate'

/**
 * The lab's toxicology instruments.
 *
 * The technologist picks the instrument they ran the batch on — not the vendor
 * software that wrote the file, which is not something anyone at the bench
 * knows or should have to. Each instrument points at the parser commissioned
 * for its export, so one parser can serve several instruments: the Agilent
 * parser here reads both LCMS5 and LCMS6.
 *
 * In production this is the Instrument Management registry, and the parser is
 * attached when the lab's sample file is turned into one.
 */

export interface ToxInstrument {
  id: string
  /** As the lab labels the box. This is what the picker shows. */
  name: string
  /** What it runs — the line under the name. */
  panel: string
  assayRole: 'screening' | 'confirmation'
  /** The parser commissioned for this instrument's export. */
  templateId: string
}

export const TOX_INSTRUMENTS: ToxInstrument[] = [
  {
    id: 'lcms5',
    name: 'LCMS5',
    panel: 'Alcohol biomarkers — EtG / EtS',
    assayRole: 'confirmation',
    templateId: 'agilent-masshunter-wide',
  },
  {
    id: 'lcms6',
    name: 'LCMS6',
    panel: 'Pain management panel and chiral confirmation',
    assayRole: 'confirmation',
    templateId: 'agilent-masshunter-wide',
  },
  {
    id: 'orion-s9',
    name: 'Orion (S9)',
    panel: 'Broad toxicology screen',
    assayRole: 'screening',
    templateId: 'shimadzu-labsolutions-long',
  },
  {
    id: 'triple-quad-6500',
    name: 'Triple Quad 6500+',
    panel: 'Drugs of abuse confirmation',
    assayRole: 'confirmation',
    templateId: 'sciex-os-doa',
  },
]

export function templateForInstrument(
  instrument: ToxInstrument,
  catalogue: ToxFileTemplate[] = TOX_TEMPLATE_CATALOGUE,
): ToxFileTemplate | null {
  return catalogue.find((t) => t.id === instrument.templateId) ?? null
}

/** Which instrument's parser fits this file — used to correct a wrong pick. */
export function instrumentForTemplate(
  templateId: string,
  instruments: ToxInstrument[] = TOX_INSTRUMENTS,
): ToxInstrument | null {
  return instruments.find((i) => i.templateId === templateId) ?? null
}
