import { describe, expect, it } from 'vitest'
import { isPlateFinal, plateFinalReason } from '../utils/plateActions'
import { PLATE_REGISTRY_MOCK } from '../data/plateTrackingMockData'
import { buildUploadDataForPlate } from '../data/plateUploadData'
import { countValidWells } from '../utils/releaseSamples'

describe('isPlateFinal', () => {
  it('treats released and rejected plates as done', () => {
    expect(isPlateFinal('Released')).toBe(true)
    expect(isPlateFinal('Rejected')).toBe(true)
  })

  it('leaves pending and partially released plates actionable', () => {
    expect(isPlateFinal('Pending')).toBe(false)
    expect(isPlateFinal('Partially Released')).toBe(false)
  })

  it('explains why a final plate is locked', () => {
    expect(plateFinalReason('Released')).toMatch(/already been released/)
    expect(plateFinalReason('Rejected')).toMatch(/been rejected/)
    expect(plateFinalReason('Pending')).toBeUndefined()
  })
})

describe('a rejected plate offers nothing to release', () => {
  it('counts zero releasable wells on QS5-01', () => {
    const plate = PLATE_REGISTRY_MOCK.find((p) => p.plateId === 'QS5-01')!
    expect(countValidWells(buildUploadDataForPlate(plate).plateWells)).toBe(0)
    expect(isPlateFinal(plate.status)).toBe(true)
  })
})
