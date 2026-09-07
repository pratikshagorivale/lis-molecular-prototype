import type { PlateLifecycleStatus, PlateQcOutcome } from '../types'

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'control'

export const PLATE_STATUS_VARIANT: Record<PlateLifecycleStatus, BadgeVariant> = {
  Pending: 'neutral',
  'Partially Released': 'warning',
  Released: 'success',
  Rejected: 'error',
}

export const QC_OUTCOME_VARIANT: Record<PlateQcOutcome, BadgeVariant> = {
  Passed: 'success',
  Failed: 'error',
}
