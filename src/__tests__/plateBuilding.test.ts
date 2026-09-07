import { describe, expect, it } from 'vitest'
import { PLATE_REGISTRY_MOCK } from '../data/plateTrackingMockData'
import { buildUploadDataForPlate, CONTROL_WELLS } from '../data/plateUploadData'
import { countReleaseableSamples, countValidWells } from '../utils/releaseSamples'

const plates = PLATE_REGISTRY_MOCK.map((p) => [p.plateId, p] as const)

describe.each(plates)('%s', (_id, plate) => {
  const data = buildUploadDataForPlate(plate)

  it('renders one well per registry sample', () => {
    const sampleWells = data.plateWells.filter((w) => w.status !== 'empty' && !w.isQc)
    expect(sampleWells).toHaveLength(plate.samples.length)
  })

  it('places every sample in the well the registry records', () => {
    for (const sample of plate.samples) {
      const well = data.plateWells.find((w) => w.wellId === sample.wellId)
      expect(well?.sampleId).toBe(sample.sampleId)
    }
  })

  it('never lets a sample collide with a control well', () => {
    const controlWells = Object.values(CONTROL_WELLS)
    expect(plate.samples.some((s) => controlWells.includes(s.wellId))).toBe(false)
  })

  it('reports sample counts matching the registry', () => {
    const { validCount, totalCount } = countReleaseableSamples(data.sampleGroups)
    expect(totalCount).toBe(plate.samplesProcessed)
    expect(validCount).toBe(plate.samplesValid)
  })

  it('counts releasable wells the same way the release modal does', () => {
    expect(countValidWells(data.plateWells)).toBe(plate.samplesValid)
  })
})
