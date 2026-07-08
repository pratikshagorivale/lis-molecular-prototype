import {
  AVAILABLE_GENES,
  AVAILABLE_ORGANISMS,
  managedInstruments as defaultManagedInstruments,
} from '../data/instrumentManagementMockData'
import type { ManagedInstrument, TargetedControlTarget, TargetedControlTargetType } from '../types'

const STORAGE_KEY = 'lis-molecular-prototype:managed-instruments'

function inferTargetType(target: string): TargetedControlTargetType {
  if (AVAILABLE_GENES.includes(target)) return 'Gene'
  if (AVAILABLE_ORGANISMS.includes(target)) return 'Organism'
  if (/^bla|^van|^mec|gene|resistance/i.test(target)) return 'Gene'
  return 'Organism'
}

function normalizeTargets(targets?: TargetedControlTarget[]): TargetedControlTarget[] | undefined {
  if (!targets) return undefined
  return targets.map((t) => ({
    ...t,
    type: t.type ?? inferTargetType(t.target),
  }))
}

function normalizeInstruments(instruments: ManagedInstrument[]): ManagedInstrument[] {
  return instruments.map((instrument) => ({
    ...instrument,
    controls: instrument.controls.map((control) => ({
      ...control,
      targets: normalizeTargets(control.targets),
    })),
  }))
}

export function loadManagedInstruments(): ManagedInstrument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultManagedInstruments
    const parsed = JSON.parse(raw) as ManagedInstrument[]
    return Array.isArray(parsed) && parsed.length > 0
      ? normalizeInstruments(parsed)
      : defaultManagedInstruments
  } catch {
    return defaultManagedInstruments
  }
}

export function saveManagedInstruments(instruments: ManagedInstrument[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instruments))
  } catch {
    // Ignore quota / private-mode errors in prototype.
  }
}

export function resetManagedInstruments(): ManagedInstrument[] {
  localStorage.removeItem(STORAGE_KEY)
  return defaultManagedInstruments
}
