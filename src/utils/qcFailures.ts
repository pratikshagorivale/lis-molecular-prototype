import type { PlateControlKey, PlateQcFailure, QcBanner } from '../types'

const CONTROL_NAMES: Record<PlateControlKey, string> = {
  PC: 'Positive Control',
  NC: 'Negative Control',
  NTC: 'NTC',
  IC: 'Internal Control',
}

const FAILURE_TEXT: Record<PlateControlKey, string> = {
  PC: 'Positive Control did not amplify within the configured cut-off.',
  NC: 'Negative Control amplified — expected Not Detected.',
  NTC: 'NTC amplified — expected Not Detected.',
  IC: 'Internal Control below cut-off — suspected inhibition.',
}

/**
 * Every control that failed on a plate, one entry each. A plate can fail several
 * controls at once, and each one is answered by its own CAPA.
 */
export function failedControlsFromBanner(banner: QcBanner): PlateQcFailure[] {
  const checks: { control: PlateControlKey; present: boolean; passed: boolean }[] = [
    { control: 'PC', present: banner.pcPresent, passed: banner.pcPassed },
    { control: 'NC', present: banner.ncPresent, passed: banner.ncPassed },
    { control: 'NTC', present: banner.ntcPresent, passed: banner.ntcPassed },
    { control: 'IC', present: banner.icPresent, passed: banner.icPassed },
  ]

  return checks
    .filter((check) => check.present && !check.passed)
    .map(({ control }) => {
      const wells = banner.failedControlWells
        .filter((well) => well.controlType.toUpperCase() === control)
        .map((well) => well.wellId)
      return {
        control,
        label: wells.length > 0 ? `${CONTROL_NAMES[control]} (${wells.join(', ')})` : CONTROL_NAMES[control],
        summary: FAILURE_TEXT[control],
      }
    })
}

/** Failures on this plate that no CAPA has been raised against yet. */
export function uncoveredFailures(
  failures: PlateQcFailure[],
  covered: PlateControlKey[],
): PlateQcFailure[] {
  return failures.filter((failure) => !covered.includes(failure.control))
}
