import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildToxBatch,
  checkFileAgainstTemplate,
  buildToxBatchFromTable,
  filterToxBatchByPositions,
  parseCsv,
} from '../utils/parseToxFile'
import { toLongTable } from '../utils/toxLongTable'
import { consistencyFor, inconsistentCount, interpretationFor } from '../utils/toxConsistency'
import { buildOrderContext } from '../data/toxOrderContext'
import { batchCounts, isPositionInvalid, toxQcBanner } from '../utils/toxEvaluation'
import { AGILENT_MASSHUNTER_WIDE, SHIMADZU_LABSOLUTIONS_LONG } from '../data/toxTemplates'
import { TOX_INSTRUMENTS, templateForInstrument } from '../data/toxInstruments'
import { drugsForInstrument } from '../data/toxDrugs'
import { managedInstruments } from '../data/instrumentManagementMockData'
import { instruments as instrumentCards } from '../data/mockData'
import { TOX_DEMO_PLATES, demoFileForPlate } from '../data/toxDemoPlates'
import { interpretationForToxOperator, type ToxControlConfig } from '../types/toxControl'
import { mergeToxBatchIntoRegistry } from '../utils/toxPlateRecord'
import { appendAuditEvent, createAuditEvent } from '../utils/plateTracking'
import { controlLabel, failuresFromControls, uncoveredFailures } from '../utils/qcFailures'
import type { ToxBatch } from '../types/tox'

/**
 * End-to-end cover for the toxicology flow, walked the way the technologist
 * walks it: pick an instrument, feed it a file, let the configured controls
 * judge the run, then read what may be released.
 *
 * These are deliberately about the seams between steps. The unit files cover
 * each step on its own.
 */

const MP = '15SEP2026_LCMS6_MP_301.csv'
const ETH = '15SEP2026_LCMS5_ETH_104.csv'
const SCREEN = 'frank091526p2_full.csv'

const rowsFor = (f: string) =>
  parseCsv(readFileSync(resolve(__dirname, '../../public/demo/tox', f), 'utf8').replace(/^\uFEFF/, ''))

const controlsFor = (id: string): ToxControlConfig[] =>
  managedInstruments.find((i) => i.id === id)?.toxControls ?? []

const instrument = (id: string) => TOX_INSTRUMENTS.find((i) => i.id === id)!

/** The whole path: instrument → template → parse → controls → batch. */
function runAs(instrumentId: string, fileName: string): ToxBatch {
  const inst = instrument(instrumentId)
  const template = templateForInstrument(inst)!
  const table = toLongTable(rowsFor(fileName), template)
  return buildToxBatchFromTable(fileName, table, template, controlsFor(instrumentId), inst.panel)
}

describe('a device is commissioned against one parser', () => {
  it('maps every toxicology device card to an instrument in the registry', () => {
    const toxCards = instrumentCards.filter((c) => c.category === 'Toxicology')
    expect(toxCards.length).toBeGreaterThan(0)
    for (const card of toxCards) {
      expect(card.toxInstrumentId).toBeTruthy()
      const inst = TOX_INSTRUMENTS.find((i) => i.id === card.toxInstrumentId)
      expect(inst, `${card.name} has no instrument`).toBeDefined()
      // And that instrument has a commissioned parser, so nothing is asked.
      expect(templateForInstrument(inst!)).not.toBeNull()
    }
  })

  it('gives the two device cards different parsers', () => {
    const byCard = instrumentCards
      .filter((c) => c.category === 'Toxicology')
      .map((c) => templateForInstrument(instrument(c.toxInstrumentId!))!.id)
    expect(new Set(byCard).size).toBe(byCard.length)
  })
})

describe('the technologist runs a plate', () => {
  it('carries the instrument pick through to the released batch', () => {
    const batch = runAs('lcms6', MP)
    expect(batch.templateId).toBe('agilent-masshunter-wide')
    expect(batch.panel).toBe('Pain management panel and chiral confirmation')
    expect(batch.positions).toHaveLength(96)
    expect(batchCounts(batch).samples).toBe(90)
  })

  it('refuses a file the picked instrument cannot have written', () => {
    const shimadzuFile = rowsFor(SCREEN)
    const check = checkFileAgainstTemplate(shimadzuFile, SCREEN, AGILENT_MASSHUNTER_WIDE)
    expect(check.ok).toBe(false)
    expect(check.suggestion?.id).toBe('shimadzu-labsolutions-long')
  })

  it('lets the suggested instrument read the same file', () => {
    const check = checkFileAgainstTemplate(rowsFor(SCREEN), SCREEN, SHIMADZU_LABSOLUTIONS_LONG)
    expect(check.ok).toBe(true)
  })
})

describe('what makes a sample positive', () => {
  const batch = runAs('lcms6', MP)

  it('calls a drug positive at or above its cut-off, negative below', () => {
    const results = batch.positions
      .filter((p) => p.type === 'Sample')
      .flatMap((p) => p.results)
    for (const r of results) {
      const expected = r.concentration != null && r.cutOff != null && r.concentration >= r.cutOff
      expect(interpretationFor(r) === 'Positive').toBe(expected)
    }
  })

  it('takes the cut-off from the drug list, not from any control', () => {
    // Move every control cut-off and no patient result may move with it.
    const loose = runAs('lcms6', MP)
    const raised = buildToxBatchFromTable(
      MP,
      toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE),
      AGILENT_MASSHUNTER_WIDE,
      controlsFor('lcms6').map((c) => ({ ...c, cutOff: '100000' })),
    )
    const positives = (b: ToxBatch) =>
      b.positions.filter((p) => p.type === 'Sample').reduce((n, p) => n + p.positivesCount, 0)

    expect(positives(loose)).toBeGreaterThan(0)
    expect(positives(raised)).toBe(positives(loose))
  })

  it('moves every patient result when the drug list moves', () => {
    const table = toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE)
    const drugs = drugsForInstrument('agilent-masshunter-wide')
    const raised = buildToxBatchFromTable(
      MP, table, AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'), undefined,
      drugs.map((d) => (d.drug === 'Morphine' ? { ...d, cutOff: 999999 } : d)),
    )
    const morphine = raised.positions
      .filter((p) => p.type === 'Sample')
      .flatMap((p) => p.results.filter((r) => r.compound === 'Morphine'))

    expect(morphine.length).toBeGreaterThan(0)
    expect(morphine.every((r) => r.cutOff === 999999)).toBe(true)
    expect(morphine.every((r) => interpretationFor(r) === 'Negative')).toBe(true)
  })

  it('does not let a control naming a drug change that drug for patients', () => {
    const base = toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE)
    const mk = (first: string, second: string) => buildToxBatchFromTable(
      MP, base, AGILENT_MASSHUNTER_WIDE,
      [
        { id: 'a', controlType: 'Calibrator', control: 'L1', scope: 'targeted', operator: '>=', drugs: [{ id: 'x', drug: 'Morphine', cutOff: first }], failureBehavior: 'fail-drug' },
        { id: 'b', controlType: 'QC', control: 'QC L', scope: 'targeted', operator: '>=', drugs: [{ id: 'y', drug: 'Morphine', cutOff: second }], failureBehavior: 'fail-drug' },
      ],
    )
    const cutOffOf = (b: ToxBatch) =>
      b.positions.find((p) => p.type === 'Sample')!.results.find((r) => r.compound === 'Morphine')!.cutOff

    // Order no longer decides anything: the drug list does.
    const configured = drugsForInstrument('agilent-masshunter-wide')
      .find((d) => d.drug === 'Morphine')!.cutOff
    expect(cutOffOf(mk('10', '500'))).toBe(configured)
    expect(cutOffOf(mk('500', '10'))).toBe(configured)
  })

  it('cannot report a drug with no cut-off, and says which', () => {
    const drugs = drugsForInstrument('agilent-masshunter-wide')
      .map((d) => (d.drug === 'Morphine' ? { ...d, cutOff: null } : d))
    const batch = buildToxBatchFromTable(
      MP, toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE),
      AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'), undefined, drugs)

    expect(batch.voidedCompounds).toContain('Morphine')
    expect(batch.warnings.join(' ')).toMatch(/no reporting cut-off/)
    expect(batch.warnings.join(' ')).toMatch(/Morphine/)

    const morphine = batch.positions
      .filter((p) => p.type === 'Sample')
      .flatMap((p) => p.results.filter((r) => r.compound === 'Morphine'))
    expect(morphine.every((r) => r.cutOff === null)).toBe(true)
  })

  it('stays reportable when the run carries no calibrators at all', () => {
    // The curve is gone, but the configured cut-offs are not, so results stand.
    const rows = rowsFor(MP).filter((r, i) => i < 2 || (r[4] ?? '').trim() !== 'Cal')
    const batch = buildToxBatch(MP, rows, AGILENT_MASSHUNTER_WIDE, [])
    const samples = batch.positions.filter((p) => p.type === 'Sample')

    expect(batch.curves.every((c) => c.lloq === null)).toBe(true)
    expect(samples.flatMap((p) => p.results).every((r) => r.cutOff != null)).toBe(true)
    expect(samples.reduce((n, p) => n + p.positivesCount, 0)).toBeGreaterThan(0)
  })
})

describe('the positive count and the positive rows agree', () => {
  it('counts exactly the drugs the drawer highlights', () => {
    const batch = runAs('lcms6', MP)
    const samples = batch.positions.filter((p) => p.type === 'Sample')
    expect(samples.reduce((n, p) => n + p.positivesCount, 0)).toBeGreaterThan(0)

    for (const sample of samples) {
      const highlighted = sample.results.filter((r) => interpretationFor(r) === 'Positive')
      expect(sample.positivesCount).toBe(highlighted.length)
    }
  })

  it('does not count a drug above the curve that never reached its cut-off', () => {
    // The old count used the verdict ladder, where Over Curve outranked the
    // cut-off. Raise one drug's cut-off past its own upper limit and it must
    // drop out of the count as well as out of the highlighted rows.
    const drugs = drugsForInstrument('agilent-masshunter-wide')
      .map((d) => (d.drug === 'Naltrexone' ? { ...d, cutOff: 9_999_999 } : d))
    const batch = buildToxBatchFromTable(
      MP, toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE),
      AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'), undefined, drugs)

    for (const sample of batch.positions.filter((p) => p.type === 'Sample')) {
      expect(sample.results.filter((r) => interpretationFor(r) === 'Positive'))
        .toHaveLength(sample.positivesCount)
      expect(sample.results.find((r) => r.compound === 'Naltrexone')
        && interpretationFor(sample.results.find((r) => r.compound === 'Naltrexone')!))
        .toBe('Negative')
    }
  })
})

describe('the well card counts inconsistencies, not positives', () => {
  const batch = runAs('lcms6', MP)
  const orders = buildOrderContext(batch)

  it('counts a drug found that was not prescribed', () => {
    const sample = batch.positions.find((p) => p.type === 'Sample' && p.positivesCount > 0)!
    const unexpected = sample.results.filter((r) =>
      interpretationFor(r) === 'Positive'
      && !(orders.get(sample.sampleId)?.prescribed ?? []).includes(r.compound))
    expect(unexpected.length).toBeGreaterThan(0)

    const count = inconsistentCount(sample.results, orders.get(sample.sampleId)?.prescribed ?? [])
    expect(count).toBeGreaterThanOrEqual(unexpected.length)
  })

  it('also counts a drug prescribed that was never found', () => {
    // This is why the count cannot be read off the positive rows alone.
    const sample = batch.positions.find((p) => {
      const prescribed = orders.get(p.sampleId)?.prescribed ?? []
      return p.type === 'Sample' && prescribed.some((drug) => {
        const result = p.results.find((r) => r.compound === drug)
        return result && interpretationFor(result) === 'Negative'
      })
    })!
    expect(sample).toBeDefined()

    const prescribed = orders.get(sample.sampleId)!.prescribed
    const missing = prescribed.filter((drug) => {
      const result = sample.results.find((r) => r.compound === drug)
      return result && interpretationFor(result) === 'Negative'
    })
    expect(missing.length).toBeGreaterThan(0)
    expect(inconsistentCount(sample.results, prescribed)).toBeGreaterThan(sample.positivesCount - 1)
  })

  it('narrows to exactly the rows the cell counts', () => {
    // What the drawer shows when narrowed is the same set the well card counts,
    // including a prescribed drug that never registered.
    const sample = batch.positions.find((p) => p.sampleId === 'T262580232')!
    const prescribed = orders.get(sample.sampleId)!.prescribed
    const narrowed = sample.results.filter(
      (r) => consistencyFor(r, prescribed).consistency === 'Inconsistent')

    expect(narrowed.map((r) => r.compound).sort())
      .toEqual(['Lamotrigine', 'Norbuprenorphine', 'Sertraline'])
    expect(narrowed).toHaveLength(inconsistentCount(sample.results, prescribed))
    // One of them is a prescribed drug that read Negative, so a positives-only
    // filter would have hidden it.
    expect(narrowed.some((r) => interpretationFor(r) === 'Negative')).toBe(true)
  })

  it('agrees with the rows the drawer marks Inconsistent', () => {
    for (const sample of batch.positions.filter((p) => p.type === 'Sample')) {
      const prescribed = orders.get(sample.sampleId)?.prescribed ?? []
      const marked = sample.results.filter(
        (r) => consistencyFor(r, prescribed).consistency === 'Inconsistent')
      expect(inconsistentCount(sample.results, prescribed)).toBe(marked.length)
    }
  })
})

describe("the patient's previous specimen", () => {
  const batch = runAs('lcms6', MP)
  const orders = buildOrderContext(batch)

  it('reports each drug on the cut-off in force now', () => {
    const withHistory = [...orders.values()].filter((o) => o.history.length > 0)
    expect(withHistory.length).toBeGreaterThan(0)

    for (const order of withHistory) {
      const sample = batch.positions.find((p) => p.sampleId === order.sampleId)!
      for (const row of order.history) {
        const current = sample.results.find((r) => r.compound === row.drug)!
        // The history is read on the same scale as the result above it.
        expect(row.cutOff).toBe(String(current.cutOff))
        expect(row.unit).toBe(current.unit || batch.unit)
      }
    }
  })

  it('does not give a patient the same number for every drug', () => {
    const varied = [...orders.values()].filter((o) => o.history.length > 1)
      .some((o) => new Set(o.history.map((h) => h.value)).size > 1)
    expect(varied).toBe(true)
  })

  it('collects the previous specimen before the run, and names the date', () => {
    for (const order of [...orders.values()].filter((o) => o.history.length > 0)) {
      expect(order.previousCollectedOn).toMatch(/^\d{1,2}(st|nd|rd|th) \w{3,4}, \d{4}$/)
      expect(Date.parse(order.previousCollectedOn.replace(/(st|nd|rd|th)/, '')))
        .toBeLessThan(Date.parse(batch.runDate))
    }
  })

  it('carries the specimen type onto both the sample and its history', () => {
    const withHistory = [...orders.values()].filter((o) => o.history.length > 0)
    expect(withHistory.length).toBeGreaterThan(0)

    for (const order of withHistory) {
      expect(order.sampleType).toBeTruthy()
      // The previous specimen was the same kind, or the comparison is meaningless.
      expect(order.history.every((h) => h.sampleType === order.sampleType)).toBe(true)
    }
    // And the lab sees more than one kind of specimen.
    expect(new Set([...orders.values()].map((o) => o.sampleType)).size).toBeGreaterThan(1)
  })

  it('gives a control no history — there is no patient behind it', () => {
    for (const control of batch.positions.filter((p) => p.type !== 'Sample')) {
      expect(orders.get(control.sampleId)).toBeUndefined()
    }
  })
})

describe('a failed control reaches where it is configured to', () => {
  it('leaves a clean run releasable', () => {
    const batch = runAs('lcms6', MP)
    expect(batch.controlOutcomes.every((o) => o.passed)).toBe(true)
    expect(batch.voidedCompounds).toHaveLength(0)
    expect(batch.qcPassed).toBe(true)
    expect(batchCounts(batch).invalid).toBe(0)
  })

  it('fail-drug invalidates every sample carrying the drug it voided', () => {
    // Tighten L2 until seven low-level drugs fall short of it. Those drugs are
    // voided, and every sample measured against that calibrator is invalid —
    // a control cannot fail while the results it underwrites stay releasable.
    const controls = controlsFor('lcms6').map((c) =>
      c.control === 'L2' ? { ...c, cutOff: '4' } : c)
    const batch = buildToxBatchFromTable(
      MP, toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE), AGILENT_MASSHUNTER_WIDE, controls)

    const l2 = batch.controlOutcomes.find((o) => o.name === 'L2')!
    expect(l2.passed).toBe(false)
    expect(l2.failedCompounds.length).toBe(7)
    expect(batch.controlVoidedCompounds).toEqual(expect.arrayContaining(l2.failedCompounds))

    // fail-drug, so the plate itself still stands...
    expect(batch.qcPassed).toBe(true)
    // ...but no sample carrying those drugs is releasable.
    const samples = batch.positions.filter((p) => p.type === 'Sample')
    expect(samples.every((p) => isPositionInvalid(p, batch))).toBe(true)
    expect(batchCounts(batch).invalid).toBe(samples.length)
  })

  it('leaves samples alone that do not carry the voided drug', () => {
    // The ETH panel has two drugs. Void one on a run of the other and nothing
    // is invalidated, because no sample was measured against it.
    const batch = buildToxBatchFromTable(
      ETH, toLongTable(rowsFor(ETH), AGILENT_MASSHUNTER_WIDE), AGILENT_MASSHUNTER_WIDE,
      [{
        id: 'x', controlType: 'QC', control: 'QC L', scope: 'targeted', operator: '>=',
        drugs: [{ id: 'd', drug: 'NotOnThisPanel', cutOff: '10' }],
        failureBehavior: 'fail-drug',
      }],
    )
    expect(batch.compounds).not.toContain('NotOnThisPanel')
    expect(batch.controlVoidedCompounds).toHaveLength(0)
    expect(batch.positions.filter((p) => p.type === 'Sample')
      .every((p) => !isPositionInvalid(p, batch))).toBe(true)
  })

  it('fail-plate invalidates every sample and nothing else', () => {
    const controls = controlsFor('lcms6').map((c) =>
      c.control === 'QC N' ? { ...c, cutOff: '20' } : c)
    const batch = buildToxBatchFromTable(
      MP, toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE), AGILENT_MASSHUNTER_WIDE, controls)

    expect(batch.controlOutcomes.find((o) => o.name === 'QC N')!.passed).toBe(false)
    expect(batch.qcPassed).toBe(false)
    const samples = batch.positions.filter((p) => p.type === 'Sample')
    expect(samples.every((p) => isPositionInvalid(p, batch))).toBe(true)
    expect(batchCounts(batch).invalid).toBe(samples.length)
    expect(batch.positions.filter((p) => p.type !== 'Sample')
      .every((p) => !isPositionInvalid(p, batch))).toBe(true)
  })

  it('names every configured control in the banner, passed or failed', () => {
    const batch = runAs('lcms6', MP)
    const items = toxQcBanner(batch)
    for (const outcome of batch.controlOutcomes) {
      expect(items.some((i) => i.label.startsWith(outcome.name))).toBe(true)
    }
    expect(items.every((i) => i.tone === 'pass')).toBe(true)
  })

  it('fails a control the lab configured that never ran', () => {
    const controls: ToxControlConfig[] = [
      ...controlsFor('lcms6'),
      { id: 'ghost', controlType: 'QC', control: 'QC MISSING', scope: 'panel', operator: '>=', cutOff: '5', failureBehavior: 'fail-plate' },
    ]
    const batch = buildToxBatchFromTable(
      MP, toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE), AGILENT_MASSHUNTER_WIDE, controls)

    const ghost = batch.controlOutcomes.find((o) => o.name === 'QC MISSING')
    expect(ghost).toBeDefined()
    expect(ghost!.passed).toBe(false)
    expect(ghost!.detail).toMatch(/not found in the file/)
    // It was configured fail-plate, so nothing on this run is releasable.
    expect(batch.qcPassed).toBe(false)
    expect(batch.positions.filter((p) => p.type === 'Sample')
      .every((p) => isPositionInvalid(p, batch))).toBe(true)
  })

  it('fails a control present in the file that has no cut-off to judge it by', () => {
    const controls = controlsFor('lcms6').map((c) => ({ ...c, cutOff: undefined }))
    const batch = buildToxBatchFromTable(
      MP, toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE), AGILENT_MASSHUNTER_WIDE, controls)

    expect(batch.controlOutcomes).toHaveLength(controls.length)
    expect(batch.controlOutcomes.every((o) => !o.passed)).toBe(true)
    expect(batch.controlOutcomes[0].detail).toMatch(/No cut-off configured/)
  })
})

describe('a control states which side of the cut-off it expects', () => {
  it('derives the expected interpretation from the operator alone', () => {
    expect(interpretationForToxOperator('>=')).toBe('Positive')
    expect(interpretationForToxOperator('<')).toBe('Negative')
  })

  it('carries that expectation onto the plate', () => {
    const batch = runAs('lcms6', MP)
    for (const outcome of batch.controlOutcomes) {
      const control = controlsFor('lcms6').find((c) => c.control === outcome.name)!
      expect(outcome.expected).toBe(interpretationForToxOperator(control.operator))
    }
    // The spiked controls expect Positive; the carryover blank expects Negative.
    expect(batch.controlOutcomes.find((o) => o.name === 'L1')!.expected).toBe('Positive')
    expect(batch.controlOutcomes.find((o) => o.name === 'QC N')!.expected).toBe('Negative')
  })

  it('judges a drug on the operator, not on the control type', () => {
    // Same QC, same cut-off, opposite expectations — opposite verdicts.
    const table = toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE)
    const mk = (operator: '>=' | '<') => buildToxBatchFromTable(
      MP, table, AGILENT_MASSHUNTER_WIDE,
      [{ id: 'q', controlType: 'QC', control: 'QC H', scope: 'panel', operator, cutOff: '40', failureBehavior: 'fail-drug' }],
    )
    const high = mk('>=')
    const low = mk('<')

    expect(high.controlOutcomes[0].expected).toBe('Positive')
    expect(low.controlOutcomes[0].expected).toBe('Negative')
    // Every drug that met one expectation missed the other.
    expect(high.controlOutcomes[0].failedCompounds.length
      + low.controlOutcomes[0].failedCompounds.length)
      .toBe(high.controlOutcomes[0].compoundCount)
  })
})

describe('the Orion run', () => {
  const batch = runAs('orion-s9', SCREEN)

  it('reads the rack and judges its five calibrators', () => {
    expect(batch.layout).toBe('rack')
    expect(batch.positions.filter((p) => p.type === 'Cal')).toHaveLength(5)
    expect(batch.controlOutcomes).toHaveLength(5)
  })

  it('passes a good screening run end to end', () => {
    // The Surine calibrator carries a subset of the 148-compound screen. A
    // panel-wide floor failed the 71 compounds that are not in the mix and took
    // every sample down with them.
    expect(batch.controlOutcomes.every((o) => o.passed)).toBe(true)
    expect(batch.voidedCompounds).toHaveLength(0)
    expect(batch.qcPassed).toBe(true)

    const samples = batch.positions.filter((p) => p.type === 'Sample')
    expect(samples).toHaveLength(20)
    expect(samples.every((p) => !isPositionInvalid(p, batch))).toBe(true)
    expect(samples.reduce((n, p) => n + p.positivesCount, 0)).toBeGreaterThan(0)
  })

  it('judges each calibrator only on the drugs it contains', () => {
    for (const outcome of batch.controlOutcomes) {
      // Twelve named drugs, not the whole 148-compound screen.
      expect(outcome.compoundCount).toBe(12)
      expect(outcome.compoundCount).toBeLessThan(batch.compounds.length)
    }
  })

  it('splits the vendor flag codes the file packs into one cell', () => {
    // LabSolutions writes 'IR: RRT%: SN' in a single column. Kept whole, the
    // position would carry composite strings that match no known code.
    const flagged = batch.positions.filter((p) => p.flags.length > 0)
    expect(flagged.length).toBeGreaterThan(0)
    expect([...new Set(batch.positions.flatMap((p) => p.flags))].sort())
      .toEqual(['AC', 'IR', 'RRT%', 'SN'])
    expect(batch.positions.every((p) => p.flags.every((f) => !f.includes(':')))).toBe(true)
  })

  it('keeps the two trays the instrument addressed differently', () => {
    // The standards sit in tray 4 at well coordinates, the samples in tray 5 at
    // vial numbers. Both are read as written rather than forced into one scheme.
    const controls = batch.positions.filter((p) => p.type !== 'Sample')
    const samples = batch.positions.filter((p) => p.type === 'Sample')
    expect(controls.every((p) => p.plateId === 'Tray 4')).toBe(true)
    expect(samples.every((p) => p.plateId === 'Tray 5')).toBe(true)
    expect(controls.every((p) => /^[A-Z]\d+$/.test(p.positionId))).toBe(true)
    expect(samples.every((p) => /^\d+$/.test(p.positionId))).toBe(true)
  })
})

describe('switching between plates', () => {
  it('names an export for every plate it offers to open', () => {
    for (const plate of TOX_DEMO_PLATES) {
      expect(demoFileForPlate(plate.plateId)).toBe(plate.fileName)
    }
  })

  it('opens each one under the plate id the dropdown shows', () => {
    for (const plate of TOX_DEMO_PLATES) {
      const rows = parseCsv(
        readFileSync(resolve(__dirname, '../../public/demo/tox', plate.fileName), 'utf8')
          .replace(/^\uFEFF/, ''),
      )
      const batch = buildToxBatch(plate.fileName, rows)
      expect(batch.batchId).toBe(plate.plateId)
      expect(batch.instrument).toBe(plate.instrument)
    }
  })

  it('has nothing to open for a plate whose export is gone', () => {
    // A plate from an uploaded file is tracked but not reopenable, so the
    // screen has to say so rather than silently do nothing.
    expect(demoFileForPlate('UPLOADED-ONLY')).toBeUndefined()
  })
})

describe('the plate is named once', () => {
  it('names a single-carrier run by its batch id alone', () => {
    // MP-001 sits on one carrier, which the instrument calls P1. Two names for
    // one plate is what made the header and the picker disagree, so the picker
    // is hidden whenever there is nothing to pick.
    const batch = runAs('lcms6', MP)
    expect(batch.batchId).toBe('MP-001')
    expect(batch.plateIds).toEqual(['P1'])
    expect(batch.plateIds.length > 1).toBe(false)
  })

  it('still distinguishes the carriers of a run that spans several', () => {
    const batch = runAs('orion-s9', SCREEN)
    expect(batch.plateIds).toHaveLength(2)
    expect(batch.plateIds.length > 1).toBe(true)
    // Every position belongs to one of them, so the picker can filter on it.
    for (const id of batch.plateIds) {
      expect(batch.positions.some((p) => p.plateId === id)).toBe(true)
    }
  })
})

describe('release gating', () => {
  it('keeps controls when the technologist selects a subset of samples', () => {
    const batch = runAs('lcms6', MP)
    const picked = batch.positions.filter((p) => p.type === 'Sample').slice(0, 3)
    const filtered = filterToxBatchByPositions(batch, new Set(picked.map((p) => p.positionId)))

    expect(filtered.positions.filter((p) => p.type === 'Sample')).toHaveLength(3)
    expect(filtered.positions.filter((p) => p.type !== 'Sample')).toHaveLength(6)
  })

  it('GAP: filtering keeps the original QC verdict even with no samples left', () => {
    const batch = runAs('lcms6', MP)
    const filtered = filterToxBatchByPositions(batch, new Set())
    expect(filtered.positions.filter((p) => p.type === 'Sample')).toHaveLength(0)
    expect(filtered.qcPassed).toBe(batch.qcPassed)
  })
})

describe('the Agilent confirmation run', () => {
  it('parses with no controls configured at all', () => {
    const batch = buildToxBatch(ETH, rowsFor(ETH), AGILENT_MASSHUNTER_WIDE, [])
    expect(batch.controlOutcomes).toHaveLength(0)
    expect(batch.qcPassed).toBe(true)
    expect(batch.voidedCompounds).toHaveLength(0)
    // The curve still gives the samples a cut-off.
    expect(batch.positions.filter((p) => p.type === 'Sample')
      .flatMap((p) => p.results).every((r) => r.cutOff != null)).toBe(true)
  })

  it('re-reading a template does not change the batch', () => {
    const first = buildToxBatch(ETH, rowsFor(ETH), AGILENT_MASSHUNTER_WIDE, [])
    const second = buildToxBatch(ETH, rowsFor(ETH), AGILENT_MASSHUNTER_WIDE, [])
    expect(second.positions.length).toBe(first.positions.length)
    expect(second.compounds).toEqual(first.compounds)
  })
})

describe('a toxicology plate is tracked like any other', () => {
  it('projects a batch onto the shared plate registry', () => {
    const batch = runAs('lcms6', MP)
    const registry = mergeToxBatchIntoRegistry([], batch)

    expect(registry).toHaveLength(1)
    const plate = registry[0]
    expect(plate.plateId).toBe('MP-001')
    expect(plate.instrument).toBe('LCMS6')
    expect(plate.status).toBe('Pending')
    expect(plate.qcOutcome).toBe('Passed')
    expect(plate.samplesProcessed).toBe(90)
    expect(plate.samplesValid).toBe(90)
    expect(plate.samplesInvalid).toBe(0)
    expect(plate.samples).toHaveLength(90)
    // Uploaded, then the QC result — the same trail a molecular plate opens with.
    expect(plate.auditTrail.map((e) => e.action)).toEqual(['uploaded', 'qc-result'])
    expect(plate.capa).toHaveLength(0)
  })

  it('keys each control by the name the lab configured', () => {
    const plate = mergeToxBatchIntoRegistry([], runAs('lcms6', MP))[0]
    expect(plate.qcControls.map((c) => c.control))
      .toEqual(['L1', 'L2', 'L3', 'QC L', 'QC H', 'QC N'])
    // The label falls back to that name rather than a molecular control's.
    expect(controlLabel(plate.qcControls[0])).toBe('L1 (A1)')
  })

  it('offers a CAPA against each failed control, and only the uncovered ones', () => {
    const controls = controlsFor('lcms6').map((c) =>
      c.control === 'QC N' ? { ...c, cutOff: '20' } : c)
    const batch = buildToxBatchFromTable(
      MP, toLongTable(rowsFor(MP), AGILENT_MASSHUNTER_WIDE), AGILENT_MASSHUNTER_WIDE, controls)
    const plate = mergeToxBatchIntoRegistry([], batch)[0]

    expect(plate.qcOutcome).toBe('Failed')
    const failures = failuresFromControls(plate.qcControls)
    expect(failures).toHaveLength(1)
    expect(failures[0].control).toBe('QC N')
    expect(failures[0].label).toBe('QC N (F1)')
    expect(failures[0].summary).toMatch(/expected Negative/)

    // Once a CAPA covers it, it is no longer offered.
    expect(uncoveredFailures(failures, ['QC N'])).toHaveLength(0)
  })

  it('records a whole-plate release and settles the plate', () => {
    const batch = runAs('lcms6', MP)
    const registry = mergeToxBatchIntoRegistry([], batch)
    const released = appendAuditEvent(
      registry,
      batch.batchId,
      createAuditEvent('released', `Released all ${batchCounts(batch).samples} sample results to LIS reports`),
      { status: 'Released', releasedBy: 'Tester', releasedAt: '2026-09-22T00:00:00.000Z' },
    )

    const plate = released[0]
    expect(plate.status).toBe('Released')
    expect(plate.releasedBy).toBe('Tester')
    expect(plate.auditTrail.map((e) => e.action)).toEqual(['uploaded', 'qc-result', 'released'])
    expect(plate.auditTrail.at(-1)!.summary).toMatch(/Released all 90 sample results/)
  })

  it('leaves a partial release short of Released', () => {
    const batch = runAs('lcms6', MP)
    const partial = appendAuditEvent(
      mergeToxBatchIntoRegistry([], batch),
      batch.batchId,
      createAuditEvent('released', 'Released selected sample results to LIS reports'),
      { status: 'Partially Released' },
    )
    expect(partial[0].status).toBe('Partially Released')
    // A partial release does not claim a releasedBy: the plate is not finished.
    expect(partial[0].releasedBy).toBeUndefined()
  })

  it('keeps what the plate has already accumulated when the batch is re-read', () => {
    const batch = runAs('lcms6', MP)
    const first = mergeToxBatchIntoRegistry([], batch)
    const withHistory = [{
      ...first[0],
      status: 'Rejected' as const,
      capa: [{ id: 'CAPA-1', plateId: 'MP-001', control: 'QC N', controlLabel: 'QC N (F1)',
        raisedBy: 'x', raisedAt: 'now', qcFailureSummary: 's', rootCause: 'r',
        correctiveAction: 'c', preventiveAction: 'p', status: 'Open' as const }],
    }]
    const again = mergeToxBatchIntoRegistry(withHistory, batch)

    expect(again).toHaveLength(1)
    expect(again[0].status).toBe('Rejected')
    expect(again[0].capa).toHaveLength(1)
    expect(again[0].auditTrail).toHaveLength(2)
  })
})
