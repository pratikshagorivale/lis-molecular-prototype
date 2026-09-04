import type { PlateLifecycleStatus, PlateQcOutcome } from '../types'

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'control'

export const PLATE_STATUS_VARIANT: Record<PlateLifecycleStatus, BadgeVariant> = {
  'Pending Validation': 'neutral',
  'In Validation': 'info',
  'Ready for Release': 'control',
  Released: 'success',
  'Partially Released': 'warning',
  Rejected: 'error',
}

export const QC_OUTCOME_VARIANT: Record<PlateQcOutcome, BadgeVariant> = {
  Passed: 'success',
  Warning: 'warning',
  Failed: 'error',
}
