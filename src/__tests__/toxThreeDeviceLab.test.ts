import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildToxBatch,
  checkFileAgainstTemplate,
  detectDelimiter,
  parseCsv,
} from '../utils/parseToxFile'
import { matchTemplate } from '../utils/toxTemplateMatch'
import {
  AGILENT_MASSHUNTER_WIDE,
  SCIEX_OS_DOA,
  SHIMADZU_LABSOLUTIONS_LONG,
  TOX_TEMPLATE_CATALOGUE,
} from '../data/toxTemplates'
import {
  TOX_INSTRUMENTS,
  instrumentForTemplate,
  templateForInstrument,
} from '../data/toxInstruments'
import type { ToxFileTemplate } from '../types/toxTemplate'

/**
 * A new lab with three instruments: an Agilent confirmation box, a Shimadzu
 * screen, and a SCIEX drugs-of-abuse panel.
 *
 * The technologist picks the parser and uploads; nothing is mapped. The SCIEX
 * export is deliberately awkward in the ways the vendor survey said real ones
 * are — tab-delimited, CR-only line endings, a .txt extension, no
 * calibrator-level column, and position as a plain vial number — so the parser
 * absorbs all of it and the UI never has to.
 */

const AGILENT = '15SEP2026_LCMS5_ETH_104.csv'
const SHIMADZU = 'frank091526p2_full.csv'
const SCIEX = '18SEP2026_SCIEX_DOA_014.txt'

function rowsFor(fileName: string): string[][] {
  const path = resolve(__dirname, '../../public/demo/tox', fileName)
  return parseCsv(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
}

const sciexTemplate: ToxFileTemplate = SCIEX_OS_DOA
const catalogue = TOX_TEMPLATE_CATALOGUE

describe('reading a file the extension lies about', () => {
  it('detects a tab delimiter and CR-only line endings', () => {
    const text = readFileSync(resolve(__dirname, '../../public/demo/tox', SCIEX), 'utf8')
    expect(text.includes('\n')).toBe(false)   // CR only — no line feeds at all
    expect(detectDelimiter(text)).toBe('\t')

    const rows = parseCsv(text)
    expect(rows.length).toBe(1153)
    expect(rows[0].length).toBe(17)
  })

  it('refuses a file the chosen parser cannot read, and names what is missing', () => {
    // The technologist picks the wrong instrument — the common mistake, and
    // with no mapping step this check is the only thing that catches it.
    const check = checkFileAgainstTemplate(rowsFor(SCIEX), SCIEX, AGILENT_MASSHUNTER_WIDE, catalogue)
    expect(check.ok).toBe(false)
    expect(check.missingColumns).toContain('Pos.')
    expect(check.suggestion?.id).toBe('sciex-os-doa')
    expect(check.detail).toMatch(/looks like a SCIEX OS/)
  })

  it('accepts the file its own parser was written for', () => {
    for (const [file, template] of [
      [AGILENT, AGILENT_MASSHUNTER_WIDE],
      [SHIMADZU, SHIMADZU_LABSOLUTIONS_LONG],
      [SCIEX, SCIEX_OS_DOA],
    ] as const) {
      expect(checkFileAgainstTemplate(rowsFor(file), file, template, catalogue).ok).toBe(true)
    }
  })
})

describe('the three devices do not collide', () => {
  it('suggests the right parser for each file', () => {
    // Used only to correct a wrong choice — the technologist still picks.
    expect(matchTemplate(rowsFor(AGILENT), AGILENT, catalogue)?.id).toBe('agilent-masshunter-wide')
    expect(matchTemplate(rowsFor(SHIMADZU), SHIMADZU, catalogue)?.id).toBe('shimadzu-labsolutions-long')
    expect(matchTemplate(rowsFor(SCIEX), SCIEX, catalogue)?.id).toBe('sciex-os-doa')
  })

  it('does not let the third parser claim the other two devices', () => {
    for (const file of [AGILENT, SHIMADZU]) {
      expect(checkFileAgainstTemplate(rowsFor(file), file, SCIEX_OS_DOA, catalogue).ok).toBe(false)
    }
  })

  it('still parses the two original devices unchanged', () => {
    const agilent = buildToxBatch(AGILENT, rowsFor(AGILENT), AGILENT_MASSHUNTER_WIDE)
    expect(agilent.positions).toHaveLength(96)
    expect(agilent.layout).toBe('grid')
    expect(agilent.plateSize).toBe(96)
    expect(agilent.compounds).toHaveLength(2)

    const shimadzu = buildToxBatch(SHIMADZU, rowsFor(SHIMADZU), SHIMADZU_LABSOLUTIONS_LONG)
    expect(shimadzu.layout).toBe('rack')
    expect(shimadzu.plateSize).toBeNull()
    expect(shimadzu.plateIds.sort()).toEqual(['Tray 4', 'Tray 5'])
  })
})

describe('the third device validates like the others', () => {
  it('builds a curve from stated nominals when there is no level column', () => {
    // SCIEX exports Actual Concentration, not a calibrator level. Without
    // recovering levels from it, no curve exists and nothing can read positive.
    const batch = buildToxBatch(SCIEX, rowsFor(SCIEX), sciexTemplate)
    const curve = batch.curves.find((c) => c.compound === 'Amphetamine')!
    expect(curve.levels.map((l) => l.expected)).toEqual([10, 50, 500])
    expect(curve.lloq).toBe(10)
    expect(curve.uloq).toBe(500)

    const positives = batch.positions
      .filter((p) => p.type === 'Sample')
      .reduce((n, p) => n + p.positivesCount, 0)
    expect(positives).toBeGreaterThan(0)
  })

  it('reads the vendor sample-type vocabulary', () => {
    const batch = buildToxBatch(SCIEX, rowsFor(SCIEX), sciexTemplate)
    expect(batch.positions.filter((p) => p.type === 'Cal')).toHaveLength(3)
    expect(batch.positions.filter((p) => p.type === 'QC')).toHaveLength(2)
    expect(batch.positions.filter((p) => p.type === 'Blank')).toHaveLength(1)
    expect(batch.positions.filter((p) => p.type === 'Sample')).toHaveLength(90)
  })

  it('lays sequential vial numbers onto a 96-well plate', () => {
    const batch = buildToxBatch(SCIEX, rowsFor(SCIEX), sciexTemplate)
    expect(batch.layout).toBe('grid')
    expect(batch.plateSize).toBe(96)
    expect(batch.positions).toHaveLength(96)
    // Vial 1 is A1 and vial 13 is B1 — row-major across 12 columns.
    expect(batch.positions.find((p) => p.sampleId === 'Cal_1')?.positionId).toBe('A1')
    const vial13 = batch.positions.find((p) => p.positionId === 'B1')
    expect(vial13).toBeDefined()
  })

  it('leaves it a rack when the lab did not plate the run', () => {
    const asRack: ToxFileTemplate = {
      ...sciexTemplate,
      position: { columns: [] },
      plateSize: 'auto',
    }
    const batch = buildToxBatch(SCIEX, rowsFor(SCIEX), asRack)
    expect(batch.layout).toBe('rack')
    expect(batch.plateSize).toBeNull()
  })
})

describe('what the batch reports about itself', () => {
  it('reads the instrument the file states', () => {
    const batch = buildToxBatch(SCIEX, rowsFor(SCIEX), SCIEX_OS_DOA)
    expect(batch.instrument).toBe('Triple Quad 6500+')
    expect(batch.batchId).toBe('DOA-014')
  })

  it('falls back to what the parser knows, never to a guess', () => {
    // Strip the instrument column. Deriving one from a synthesised injection
    // id used to produce garbage like '1|19/18/2026 8:07:00 AM'.
    const rows = rowsFor(SCIEX).map((row) => row.slice(0, 16))
    const batch = buildToxBatch(SCIEX, rows, SCIEX_OS_DOA)
    expect(batch.instrument).toBe('SCIEX')
  })

  it('still reads the instrument out of a real data-file name', () => {
    const batch = buildToxBatch(AGILENT, rowsFor(AGILENT), AGILENT_MASSHUNTER_WIDE)
    expect(batch.instrument).toBe('LCMS5')
    expect(batch.batchId).toBe('ETH-004')
  })

  it('records which parser produced the batch', () => {
    const batch = buildToxBatch(SCIEX, rowsFor(SCIEX), SCIEX_OS_DOA)
    expect(batch.templateId).toBe('sciex-os-doa')
    expect(batch.templateLabel).toBe('SCIEX OS — drugs of abuse')
  })
})

describe('the technologist picks an instrument, not a parser', () => {
  it('gives every instrument a commissioned parser', () => {
    for (const instrument of TOX_INSTRUMENTS) {
      expect(templateForInstrument(instrument)).not.toBeNull()
    }
  })

  it('lets one parser serve several instruments', () => {
    // LCMS5 and LCMS6 are different boxes running the same export format.
    const lcms5 = TOX_INSTRUMENTS.find((i) => i.name === 'LCMS5')!
    const lcms6 = TOX_INSTRUMENTS.find((i) => i.name === 'LCMS6')!
    expect(lcms5.templateId).toBe(lcms6.templateId)
    expect(templateForInstrument(lcms5)?.id).toBe('agilent-masshunter-wide')
  })

  it('reads each instrument\'s own file', () => {
    const cases: [string, string][] = [
      ['LCMS5', AGILENT],
      ['Orion (S9)', SHIMADZU],
      ['Triple Quad 6500+', SCIEX],
    ]
    for (const [name, file] of cases) {
      const instrument = TOX_INSTRUMENTS.find((i) => i.name === name)!
      const template = templateForInstrument(instrument)!
      expect(checkFileAgainstTemplate(rowsFor(file), file, template, catalogue).ok).toBe(true)
    }
  })

  it('names the instrument to pick instead, not the parser', () => {
    // The technologist picks LCMS5 and uploads the Orion file by mistake.
    const lcms5 = TOX_INSTRUMENTS.find((i) => i.name === 'LCMS5')!
    const check = checkFileAgainstTemplate(
      rowsFor(SHIMADZU), SHIMADZU, templateForInstrument(lcms5)!, catalogue,
    )
    expect(check.ok).toBe(false)
    const suggested = instrumentForTemplate(check.suggestion!.id, TOX_INSTRUMENTS)
    expect(suggested?.name).toBe('Orion (S9)')
  })
})

describe('plate identity', () => {
  it('flags a filename that disagrees with the batch in the data files', () => {
    // ETH_104.csv contains data files named ..._ETH_004_*.d
    const batch = buildToxBatch(AGILENT, rowsFor(AGILENT), AGILENT_MASSHUNTER_WIDE)
    expect(batch.batchId).toBe('ETH-004')
    expect(batch.fileBatchId).toBe('ETH-104')
  })

  it('does not flag a conflict when the filename is the only source', () => {
    // The SCIEX export states no batch of its own, so the filename is simply
    // where the id came from — not two sources disagreeing.
    const batch = buildToxBatch(SCIEX, rowsFor(SCIEX), SCIEX_OS_DOA)
    expect(batch.batchId).toBe('DOA-014')
    expect(batch.fileBatchId).toBeUndefined()
  })
})
