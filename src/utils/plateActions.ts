import type { PlateLifecycleStatus } from '../types'

/**
 * Released and rejected plates are done — releasing or rejecting again would
 * append a second, contradictory decision to the audit trail. A partially
 * released plate is not final; the held-back samples can still be released.
 */
export function isPlateFinal(status: PlateLifecycleStatus): boolean {
  return status === 'Released' || status === 'Rejected'
}

export function plateFinalReason(status: PlateLifecycleStatus): string | undefined {
  if (status === 'Released') return 'This plate has already been released'
  if (status === 'Rejected') return 'This plate has been rejected'
  return undefined
}
