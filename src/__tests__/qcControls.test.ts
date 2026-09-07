import { describe, expect, it } from 'vitest'
import {
  bannerFromControls,
  controlLabel,
  controlsFromBanner,
  failuresFromControls,
  uncoveredFailures,
} from '../utils/qcFailures'
import { PLATE_REGISTRY_MOCK } from '../data/plateTrackingMockData'
import { buildUploadDataForPlate } from '../data/plateUploadData'
import type { PlateQcControl } from '../types'

const PASSING: PlateQcControl[] = [
  { control: 'PC', wells: ['H10'], passed: true },
  { control: 'NC', wells: ['H11'], passed: true },
]

describe('controlLabel', () => {
  it('includes the wells the control occupies', () => {
    expect(controlLabel({ control: 'PC', wells: ['H10'], passed: true })).toBe('Positive Control (H10)')
  })

  it('omits the bracket when the control has no dedicated well', () => {
    expect(controlLabel({ control: 'IC', wells: [], passed: false })).toBe('Internal Control')
  })
})

describe('failuresFromControls', () => {
  it('returns only failed controls', () => {
    const failures = failuresFromControls([
      ...PASSING,
      { control: 'NTC', wells: ['H12'], passed: false },
    ])
    expect(failures.map((f) => f.control)).toEqual(['NTC'])
  })

  it('falls back to standard wording when a failure has no summary', () => {
    const [failure] = failuresFromControls([{ control: 'PC', wells: ['H10'], passed: false }])
    expect(failure.summary).toMatch(/did not amplify/i)
  })

  it('prefers the recorded summary', () => {
    const [failure] = failuresFromControls([
      { control: 'PC', wells: ['H10'], passed: false, summary: 'Lot MM-4471 breach.' },
    ])
    expect(failure.summary).toBe('Lot MM-4471 breach.')
  })
})

describe('bannerFromControls', () => {
  it('marks a control absent when the plate does not run it', () => {
    const banner = bannerFromControls(PASSING)
    expect(banner.ntcPresent).toBe(false)
    expect(banner.icPresent).toBe(false)
    expect(banner.qcPassed).toBe(true)
  })

  it('pins each failure to its wells', () => {
    const banner = bannerFromControls([
      ...PASSING,
      { control: 'NTC', wells: ['H12'], passed: false },
    ])
    expect(banner.qcPassed).toBe(false)
    expect(banner.failedControlWells).toEqual([
      { wellId: 'H12', controlType: 'NTC', sampleId: 'NTC', label: 'NTC' },
    ])
  })

  it('round-trips through controlsFromBanner', () => {
    const controls: PlateQcControl[] = [
      { control: 'PC', wells: ['H10'], passed: false },
      { control: 'NC', wells: ['H11'], passed: true },
      { control: 'NTC', wells: ['H12'], passed: false },
    ]
    const back = controlsFromBanner(bannerFromControls(controls))
    expect(back.map((c) => [c.control, c.passed])).toEqual([['PC', false], ['NC', true], ['NTC', false]])
  })
})

describe('uncoveredFailures', () => {
  it('drops failures that already have a CAPA', () => {
    const failures = failuresFromControls([
      { control: 'PC', wells: ['H10'], passed: false },
      { control: 'NTC', wells: ['H12'], passed: false },
    ])
    expect(uncoveredFailures(failures, ['PC']).map((f) => f.control)).toEqual(['NTC'])
  })
})

describe('every registry plate agrees across its views', () => {
  it.each(PLATE_REGISTRY_MOCK.map((p) => [p.plateId, p] as const))(
    '%s banner matches its control list',
    (_id, plate) => {
      const banner = buildUploadDataForPlate(plate).qcBanner
      const fromBanner = controlsFromBanner(banner)

      expect(fromBanner.map((c) => c.control)).toEqual(plate.qcControls.map((c) => c.control))
      expect(fromBanner.map((c) => c.passed)).toEqual(plate.qcControls.map((c) => c.passed))
      expect(banner.qcPassed).toBe(plate.qcOutcome === 'Passed')
    },
  )
})
