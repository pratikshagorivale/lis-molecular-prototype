import type { SampleGroup, WellData } from '../types'
import { isValidSampleWell } from './targetedControlImpact'

export function getValidSampleGroups(groups: SampleGroup[]) {
  return groups.filter((g) => g.status === 'Ready for Release')
}

export function countReleaseableSamples(groups: SampleGroup[]) {
  const validSamples = getValidSampleGroups(groups)
  return {
    validCount: validSamples.length,
    totalCount: groups.length,
    validSamples,
  }
}

/**
 * Wells that can actually be released: a sample well, unaffected by a failed
 * targeted control, whose own validation passed. Excluding the last condition
 * counted failed and needs-review samples as releasable.
 */
export function countValidWells(plateWells: WellData[]): number {
  return plateWells.filter((well) => isValidSampleWell(well) && well.status === 'ready').length
}
