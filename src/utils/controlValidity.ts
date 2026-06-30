import { normalizeTargetName } from './targetNames'

export interface TargetControlValidityContext {
  qcPassed: boolean
  affectedTargets: Set<string>
  invalidateAllSamples: boolean
}

/** Whether a single target row passes configured plate / targeted control checks. */
export function isTargetControlPassed(
  targetName: string,
  ctx: TargetControlValidityContext,
): boolean {
  if (ctx.invalidateAllSamples) return false
  if (!ctx.qcPassed) return false
  return !ctx.affectedTargets.has(normalizeTargetName(targetName))
}

/** Whether every target row for a sample passes control checks. */
export function isSampleValidFromControlResults(controlResults: boolean[]): boolean {
  return controlResults.length > 0 && controlResults.every(Boolean)
}
