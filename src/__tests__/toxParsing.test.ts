import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildToxBatch, parseCsv } from '../utils/parseToxFile'
import { interpretationFor } from '../utils/toxConsistency'
import { drugsForInstrument } from '../data/toxDrugs'
import type { ToxBatch } from '../types/tox'

function load(fileName: string): ToxBatch {
  const path = resolve(__dirname, '../../public/demo/tox', fileName)
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  return buildToxBatch(fileName, parseCsv(text))
}

const ETH = '15SEP2026_LCMS5_ETH_104.csv'
const MP = '15SEP2026_LCMS6_MP_301.csv'
const SCREEN = 'frank091526p2_full.csv'

describe('Agilent wide format', () => {
  const batch = load(ETH)

  it('un-pivots the compound groups', () => {
    expect(batch.templateId).toBe('agilent-masshunter-wide')
    expect(batch.assayRole).toBe('confirmation')
    expect(batch.compounds).toEqual(['EtS', 'EtG'])
    expect(batch.instrument).toBe('LCMS5')
  })

  it('collapses 102 acquisitions onto 96 physical wells', () => {
    expect(batch.positions).toHaveLength(96)
    // One position per well, never two.
    const keys = batch.positions.map((p) => `${p.plateId}|${p.positionId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps the later acquisition when a well was read twice', () => {
    // The six control wells are read again at the end of the sequence. The
    // well shows that closing read, not the opening one.
    const controls = batch.positions.filter((p) => p.type !== 'Sample')
    expect(controls.map((p) => p.positionId).sort()).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1'])

    const lastSample = Math.max(...batch.positions
      .filter((p) => p.type === 'Sample')
      .map((p) => Date.parse(p.acquiredAt)))
    for (const control of controls) {
      expect(Date.parse(control.acquiredAt)).toBeGreaterThan(lastSample)
    }
  })

  it('recovers nominal calibrator concentrations from found / accuracy', () => {
    const curve = batch.curves.find((c) => c.compound === 'EtG')!
    expect(curve.levels.map((l) => l.expected)).toEqual([250, 500, 10000])
    expect(curve.lloq).toBe(250)
    expect(curve.uloq).toBe(10000)
  })

  it('routes samples above the curve to dilution, not to failure', () => {
    const dilution = batch.positions.filter((p) => p.requiresDilution)
    expect(dilution.every((p) => p.type === 'Sample')).toBe(true)
    expect(dilution.map((p) => p.sampleId).sort()).toEqual([
      'T262580486', 'T262580487', 'T262580488',
    ])
    expect(dilution.every((p) => p.results.some((r) => r.verdict === 'Over Curve'))).toBe(true)
  })

  it('flags the filename batch disagreeing with the acquisition batch', () => {
    expect(batch.batchId).toBe('ETH-004')
    expect(batch.fileBatchId).toBe('ETH-104')
    expect(batch.warnings.join(' ')).toMatch(/disagrees/)
  })
})

describe('large panel', () => {
  const batch = load(MP)

  it('parses all 75 analytes across 96 wells', () => {
    expect(batch.compounds).toHaveLength(75)
    expect(batch.positions).toHaveLength(96)
    expect(batch.plateIds).toEqual(['P1'])
  })

  it('produces one curve per compound', () => {
    expect(batch.curves).toHaveLength(75)
  })
})

describe('Shimadzu long format', () => {
  const batch = load(SCREEN)

  it('groups 3,775 compound rows onto 25 positions', () => {
    expect(batch.templateId).toBe('shimadzu-labsolutions-long')
    expect(batch.assayRole).toBe('screening')
    expect(batch.positions).toHaveLength(25)
    expect(batch.instrument).toBe('Orion (S9)')
  })

  it('excludes internal standards from the analyte list', () => {
    expect(batch.compounds).toHaveLength(79)
    expect(batch.compounds.some((c) => /[\s-]D\d|\bIS$/.test(c))).toBe(false)
  })

  it('reads a vial rack, not a plate grid', () => {
    expect(batch.layout).toBe('rack')
    expect(batch.plateIds.sort()).toEqual(['Tray 4', 'Tray 5'])
  })

  it('warns about the implausible mg/dL unit', () => {
    expect(batch.warnings.join(' ')).toMatch(/mg\/dL/)
  })

  it('carries per-compound flags through to results', () => {
    const flagged = batch.positions
      .filter((p) => p.type === 'Sample')
      .flatMap((p) => p.results.filter((r) => r.flags.length > 0))
    expect(flagged.length).toBe(31)
    expect(new Set(flagged.flatMap((r) => r.flags))).toContain('SN')
  })
})

describe('reporting cut-offs', () => {
  it('comes from the instrument drug list, not from the run', () => {
    const batch = load(ETH)
    const sample = batch.positions.find((p) => p.type === 'Sample')!
    const etg = sample.results.find((r) => r.compound === 'EtG')!
    const configured = drugsForInstrument('agilent-masshunter-wide')
      .find((d) => d.drug === 'EtG')!.cutOff
    expect(etg.cutOff).toBe(configured)
  })

  it('leaves the curve to state the measuring range and nothing else', () => {
    const batch = load(ETH)
    const curve = batch.curves.find((c) => c.compound === 'EtG')!
    expect(curve.lloq).toBe(250)
    expect(curve.uloq).toBe(10000)
    // The curve no longer carries a verdict of its own.
    expect('passed' in curve).toBe(false)
  })
})

describe('interpretation is binary and comes from the cut-off', () => {
  const batch = load(MP)
  const results = batch.positions
    .filter((p) => p.type === 'Sample')
    .flatMap((p) => p.results)

  it('reads Positive or Negative and nothing else', () => {
    expect(new Set(results.map(interpretationFor))).toEqual(new Set(['Positive', 'Negative']))
  })

  it('calls a drug positive exactly when it reaches its cut-off', () => {
    for (const result of results) {
      const expected = result.concentration != null
        && result.cutOff != null
        && result.concentration >= result.cutOff
      expect(interpretationFor(result) === 'Positive').toBe(expected)
    }
  })

  it('does not let needing a dilution change the interpretation', () => {
    // A sample above the curve still reads Positive; the dilution is carried
    // on the position, not in the drug's interpretation.
    const overCurve = results.filter((r) => r.verdict === 'Over Curve')
    expect(overCurve.length).toBeGreaterThan(0)
    expect(overCurve.every((r) => interpretationFor(r) === 'Positive')).toBe(true)
  })
})
