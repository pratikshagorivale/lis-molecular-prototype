import type {
  AuditQcResult,
  PlateControlKey,
  PlateQcControl,
  PlateQcFailure,
  QcBanner,
} from '../types'

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

/** "Positive Control (H10)" — the name plus the wells it occupies. */
export function controlLabel(control: PlateQcControl): string {
  const name = CONTROL_NAMES[control.control]
  return control.wells.length > 0 ? `${name} (${control.wells.join(', ')})` : name
}

/** The failed controls, each resolved for display and CAPA scoping. */
export function failuresFromControls(controls: PlateQcControl[]): PlateQcFailure[] {
  return controls
    .filter((control) => !control.passed)
    .map((control) => ({
      control: control.control,
      label: controlLabel(control),
      summary: control.summary ?? FAILURE_TEXT[control.control],
    }))
}

/** The same list rendered as audit-trail QC results. */
export function auditResultsFromControls(controls: PlateQcControl[]): AuditQcResult[] {
  return controls.map((control) => ({
    control: controlLabel(control),
    passed: control.passed,
    detail: control.detail,
  }))
}

/** Read a parsed upload's QC banner back into the control list. */
export function controlsFromBanner(banner: QcBanner): PlateQcControl[] {
  const checks: { control: PlateControlKey; present: boolean; passed: boolean }[] = [
    { control: 'PC', present: banner.pcPresent, passed: banner.pcPassed },
    { control: 'NC', present: banner.ncPresent, passed: banner.ncPassed },
    { control: 'NTC', present: banner.ntcPresent, passed: banner.ntcPassed },
    { control: 'IC', present: banner.icPresent, passed: banner.icPassed },
  ]

  return checks
    .filter((check) => check.present)
    .map(({ control, passed }) => ({
      control,
      wells: banner.failedControlWells
        .filter((well) => well.controlType.toUpperCase() === control)
        .map((well) => well.wellId),
      passed,
      detail: passed ? 'Within configured limits' : 'Outside configured limits',
    }))
}

/** Build the plate banner from the control list, so the two always agree. */
export function bannerFromControls(controls: PlateQcControl[]): QcBanner {
  const find = (key: PlateControlKey) => controls.find((c) => c.control === key)
  const present = (key: PlateControlKey) => Boolean(find(key))
  const passed = (key: PlateControlKey) => find(key)?.passed ?? true

  const failedControlWells = controls
    .filter((control) => !control.passed)
    .flatMap((control) => control.wells.map((wellId) => ({
      wellId,
      controlType: control.control,
      sampleId: control.control,
      label: control.control,
    })))

  const allPassed = controls.every((control) => control.passed)

  return {
    pcPassed: passed('PC'),
    ncPassed: passed('NC'),
    ntcPassed: passed('NTC'),
    icPassed: passed('IC'),
    pcPresent: present('PC'),
    ncPresent: present('NC'),
    ntcPresent: present('NTC'),
    icPresent: present('IC'),
    qcPassed: allPassed,
    failedControlWells,
    status: allPassed ? 'Valid' : 'Needs review',
  }
}

/** Failures on this plate that no CAPA has been raised against yet. */
export function uncoveredFailures(
  failures: PlateQcFailure[],
  covered: PlateControlKey[],
): PlateQcFailure[] {
  return failures.filter((failure) => !covered.includes(failure.control))
}
