import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildToxBatch, matchControl, parseCsv } from '../utils/parseToxFile'
import { isPositionInvalid } from '../utils/toxEvaluation'
import { AGILENT_MASSHUNTER_WIDE, SHIMADZU_LABSOLUTIONS_LONG } from '../data/toxTemplates'
import { managedInstruments } from '../data/instrumentManagementMockData'
import type { ToxControlConfig } from '../types/toxControl'

/**
 * The parser reads the file; Instrument Management says what the lab expects.
 * These cover the seam: control names, levels and recovery windows coming from
 * configuration rather than from the parser's own guesses.
 */

const MP = '15SEP2026_LCMS6_MP_301.csv'
const SCREEN = 'frank091526p2_full.csv'

const rowsFor = (f: string) =>
  parseCsv(readFileSync(resolve(__dirname, '../../public/demo/tox', f), 'utf8').replace(/^\uFEFF/, ''))

const controlsFor = (id: string): ToxControlConfig[] =>
  managedInstruments.find((i) => i.id === id)?.toxControls ?? []

describe('controls are configured, not inferred', () => {
  it('ships both tox instruments with their controls', () => {
    expect(controlsFor('lcms6')).toHaveLength(6)
    expect(controlsFor('orion-s9')).toHaveLength(5)
    expect(controlsFor('lcms6').map((c) => c.control))
      .toEqual(['L1', 'L2', 'L3', 'QC L', 'QC H', 'QC N'])
  })

  it('matches an injection to a control by the name the instrument writes', () => {
    const controls = controlsFor('lcms6')
    expect(matchControl('QC L', controls)?.controlType).toBe('QC')
    expect(matchControl('qc n', controls)?.controlType).toBe('Blank')
    expect(matchControl('T262580282', controls)).toBeNull()
  })

  it('classifies injections from the configuration', () => {
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'))
    expect(batch.positions.filter((p) => p.type === 'Cal')).toHaveLength(3)
    expect(batch.positions.filter((p) => p.type === 'QC')).toHaveLength(2)
    expect(batch.positions.filter((p) => p.type === 'Blank')).toHaveLength(1)
    expect(batch.positions.filter((p) => p.type === 'Sample')).toHaveLength(90)
  })

  it('takes calibrator levels from the configuration', () => {
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'))
    const curve = batch.curves.find((c) => c.compound === 'Morphine')!
    expect(curve.levels.map((l) => l.level)).toEqual([1, 2, 3])
  })

  it('builds a curve for Orion, whose export has no usable level column', () => {
    // LabSolutions writes a Level column, but the lab's Cal_1..Cal_5 naming is
    // what actually orders the curve.
    const batch = buildToxBatch(SCREEN, rowsFor(SCREEN), SHIMADZU_LABSOLUTIONS_LONG, controlsFor('orion-s9'))
    expect(batch.positions.filter((p) => p.type === 'Cal')).toHaveLength(5)
    const curve = batch.curves.find((c) => c.levels.length === 5)
    expect(curve).toBeDefined()
  })

  it('judges a control on the cut-off the lab configured', () => {
    // Raise QC L's cut-off and more drugs must fall short of it.
    const tight = controlsFor('lcms6').map((c) => (
      c.control === 'QC L' ? { ...c, cutOff: '500' } : c
    ))
    const loose = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'))
    const strict = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, tight)

    const failed = (b: typeof loose) => b.controlOutcomes
      .filter((c) => c.name === 'QC L')
      .reduce((n, c) => n + c.failedCompounds.length, 0)

    expect(failed(strict)).toBeGreaterThan(failed(loose))
  })

  it("reads a control the way its operator says, not the way its type implies", () => {
    const blankOnly = controlsFor('lcms6').filter((c) => c.controlType === 'Blank')
    expect(blankOnly).toHaveLength(1)

    // QC N expects Negative: every drug below the cut-off. It tops out at
    // 28.3, so 30 is clean and 20 leaves one drug reading Positive.
    expect(blankOnly[0].operator).toBe('<')
    const clean = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE,
      blankOnly.map((c) => ({ ...c, cutOff: '30' })))
    const dirty = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE,
      blankOnly.map((c) => ({ ...c, cutOff: '20' })))

    expect(clean.controlOutcomes[0].expected).toBe('Negative')
    expect(clean.controlOutcomes[0].passed).toBe(true)
    expect(dirty.controlOutcomes[0].passed).toBe(false)
    expect(dirty.controlOutcomes[0].detail).toMatch(/did not read Negative/)

    // Flip the operator and the same reading becomes the pass condition.
    const flipped = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE,
      blankOnly.map((c) => ({ ...c, operator: '>=' as const, cutOff: '30' })))
    expect(flipped.controlOutcomes[0].expected).toBe('Positive')
    expect(flipped.controlOutcomes[0].passed).toBe(false)
  })

  it('will not pass a control it has no cut-off to judge by', () => {
    const noCutOff = controlsFor('lcms6').map((c) => ({ ...c, cutOff: undefined }))
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, noCutOff)
    expect(batch.controlOutcomes).toHaveLength(noCutOff.length)
    expect(batch.controlOutcomes.every((o) => !o.passed)).toBe(true)
    // QC N is configured fail-plate, so an unjudged run is not releasable.
    expect(batch.qcPassed).toBe(false)
  })

  it('still parses when no controls are configured yet', () => {
    // A device onboarded before its controls are set must not break; the
    // template's own vocabulary carries it.
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, [])
    expect(batch.positions.filter((p) => p.type === 'Cal')).toHaveLength(3)
    expect(batch.positions.filter((p) => p.type === 'Sample')).toHaveLength(90)
  })
})

describe('both parsers extract everything in the file', () => {
  it('keeps every Agilent column, including the un-pivoted ones', () => {
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'))
    expect(batch.compounds).toHaveLength(75)
    expect(batch.positions).toHaveLength(96)
    const sample = batch.positions.find((p) => p.type === 'Sample')!
    const result = sample.results[0]
    // Every per-compound column the file carries.
    expect(result.concentration).not.toBeNull()
    expect(result.retentionTime).not.toBeNull()
    const cal = batch.positions.find((p) => p.type === 'Cal')!
    expect(cal.results[0].accuracy).not.toBeNull()
  })

  it('keeps all 131 Shimadzu columns, mapped or not', () => {
    const batch = buildToxBatch(SCREEN, rowsFor(SCREEN), SHIMADZU_LABSOLUTIONS_LONG, controlsFor('orion-s9'))
    expect(batch.compounds).toHaveLength(79)
    // 131 columns, 21 bound to system fields, the rest carried as extras.
    expect(batch.extraColumns.length).toBeGreaterThan(100)
    const sample = batch.positions.find((p) => p.type === 'Sample')!
    const result = sample.results[0]
    expect(result.istdArea).not.toBeNull()
    expect(result.ionRatio).not.toBeNull()
    expect(Object.keys(result.extras).length).toBeGreaterThan(50)
    // Unbound vendor detail survives to the drawer; bound columns do not
    // duplicate into extras. Only non-empty values are kept, so assert on
    // columns the file always populates.
    expect(result.extras['Block #']).toBeTruthy()
    expect(result.extras['Sample ID']).toBeTruthy()
    expect(result.extras['ISTD Name']).toBeUndefined()
  })
})

describe('a failed control reaches exactly as far as it is configured to', () => {
  it('voids the drugs a fail-drug control failed on, without failing the plate', () => {
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE,
      controlsFor('lcms6').map((c) => (c.control === 'L2' ? { ...c, cutOff: '4' } : c)))
    const failedOnAControl = new Set(
      batch.controlOutcomes
        .filter((o) => o.failureBehavior === 'fail-drug')
        .flatMap((o) => o.failedCompounds),
    )
    expect(failedOnAControl.size).toBeGreaterThan(0)
    for (const compound of failedOnAControl) {
      expect(batch.voidedCompounds).toContain(compound)
    }
    // Not every drug goes: the failure is scoped to the ones that fell short.
    expect(batch.voidedCompounds.length).toBeLessThan(batch.compounds.length)
    // The control was not configured to fail the plate, so QC itself stands...
    expect(batch.qcPassed).toBe(true)
    // ...while the samples measured against it are not releasable.
    expect(batch.positions.filter((p) => p.type === 'Sample')
      .every((p) => isPositionInvalid(p, batch))).toBe(true)
  })

  it('fails the whole plate when a fail-plate control fails', () => {
    // Raise QC L past anything on the plate and mark it fail-plate.
    const controls = controlsFor('lcms6').map((c) => (
      c.control === 'QC L'
        ? { ...c, cutOff: '500', failureBehavior: 'fail-plate' as const }
        : c
    ))
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controls)

    expect(batch.controlOutcomes.find((o) => o.name === 'QC L')!.passed).toBe(false)
    expect(batch.qcPassed).toBe(false)

    const samples = batch.positions.filter((p) => p.type === 'Sample')
    expect(samples.every((p) => isPositionInvalid(p, batch))).toBe(true)
  })

})

describe('plate states are the four molecular ones', () => {
  it('calls a sample invalid when a control it depended on failed', () => {
    const clean = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'))
    expect(clean.qcPassed).toBe(true)
    expect(clean.positions
      .filter((p) => p.type === 'Sample')
      .every((p) => !isPositionInvalid(p, clean))).toBe(true)

    // One calibrator drifts; the samples it underwrote go with it.
    const drifted = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE,
      controlsFor('lcms6').map((c) => (c.control === 'L2' ? { ...c, cutOff: '4' } : c)))
    expect(drifted.controlOutcomes.find((o) => o.name === 'L2')!.passed).toBe(false)
    expect(drifted.positions
      .filter((p) => p.type === 'Sample')
      .every((p) => isPositionInvalid(p, drifted))).toBe(true)
  })

  it('does not call a positive or an over-curve sample invalid', () => {
    // A positive is a finding, and a sample above the curve has a sound
    // measurement that simply needs diluting. Neither is a failed well.
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controlsFor('lcms6'))
    expect(batch.controlOutcomes.every((o) => o.passed)).toBe(true)
    const positives = batch.positions.filter((p) => p.type === 'Sample' && p.positivesCount > 0)
    const dilutions = batch.positions.filter((p) => p.type === 'Sample' && p.requiresDilution)

    expect(positives.length).toBeGreaterThan(0)
    expect(dilutions.length).toBeGreaterThan(0)
    expect(positives.every((p) => !isPositionInvalid(p, batch))).toBe(true)
    expect(dilutions.every((p) => !isPositionInvalid(p, batch))).toBe(true)
  })

  it('never calls a control a sample', () => {
    const controls = controlsFor('lcms6').map((c) => (
      c.control === 'QC L' ? { ...c, cutOff: '500', failureBehavior: 'fail-plate' as const } : c
    ))
    const batch = buildToxBatch(MP, rowsFor(MP), AGILENT_MASSHUNTER_WIDE, controls)
    expect(batch.qcPassed).toBe(false)
    for (const control of batch.positions.filter((p) => p.type !== 'Sample')) {
      // Controls carry their own outcome; the sample rule never touches them.
      expect(isPositionInvalid(control, batch)).toBe(false)
    }
  })
})
