import { managedInstruments as defaultManagedInstruments } from '../data/instrumentManagementMockData'
import type { ManagedInstrument } from '../types'

const STORAGE_KEY = 'lis-molecular-prototype:managed-instruments'

export function loadManagedInstruments(): ManagedInstrument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultManagedInstruments
    const parsed = JSON.parse(raw) as ManagedInstrument[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultManagedInstruments
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
