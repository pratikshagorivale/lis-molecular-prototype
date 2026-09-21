import { describe, expect, it } from 'vitest'
import { PLATE_REGISTRY_MOCK } from '../data/plateTrackingMockData'
import { partiallyCompletedEntries } from '../data/waitingListMockData'
import { tracePlates } from '../utils/plateTracking'

/** The report entry screen resolves its source plates exactly this way. */
function sourcePlatesFor(sampleId: string) {
  return tracePlates(PLATE_REGISTRY_MOCK, sampleId).sampleHits.map((hit) => hit.plate)
}

describe('a report traces back to the plate its results came from', () => {
  it('resolves a queued report to a single plate and well', () => {
    const entry = partiallyCompletedEntries.find((e) => e.sampleId === '000727420')!
    const plates = sourcePlatesFor(entry.sampleId)

    expect(plates.map((p) => p.plateId)).toEqual(['AB1P'])
    expect(plates[0].samples.find((s) => s.sampleId === entry.sampleId)!.wellId).toBe('B2')
  })

  it('reports nothing rather than guessing when a sample was never run on a plate', () => {
    expect(sourcePlatesFor('000108826')).toEqual([])
  })

  it('exposes the audit trail of the plate it resolves to', () => {
    const [plate] = sourcePlatesFor('000727420')
    expect(plate.auditTrail.length).toBeGreaterThan(0)
    expect(plate.auditTrail.some((e) => e.action === 'uploaded')).toBe(true)
  })
})

describe('sample IDs identify one plate', () => {
  it('never assigns the same sample ID to two plates', () => {
    const seen = new Map<string, string>()
    for (const plate of PLATE_REGISTRY_MOCK) {
      for (const sample of plate.samples) {
        const existing = seen.get(sample.sampleId)
        expect(existing, `${sample.sampleId} is on both ${existing} and ${plate.plateId}`).toBeUndefined()
        seen.set(sample.sampleId, plate.plateId)
      }
    }
  })

  it('resolves every queued report to at most one plate', () => {
    for (const entry of partiallyCompletedEntries) {
      expect(sourcePlatesFor(entry.sampleId).length).toBeLessThanOrEqual(1)
    }
  })
})
