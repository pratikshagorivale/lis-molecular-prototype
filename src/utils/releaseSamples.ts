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

export function countValidWells(plateWells: WellData[]): number {
  return plateWells.filter(isValidSampleWell).length
}
