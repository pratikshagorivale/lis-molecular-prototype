import { CURRENT_USER, PLATE_REGISTRY_MOCK } from '../data/plateTrackingMockData'
import type {
  CapaFormData,
  CapaRecord,
  PlateAuditAction,
  PlateAuditEvent,
  PlateLifecycleStatus,
  PlateRecord,
  PlateSampleRef,
} from '../types'

const STORAGE_KEY = 'lis-molecular-prototype:plate-registry'

const VALID_STATUSES: PlateLifecycleStatus[] = ['Pending', 'Partially Released', 'Released', 'Rejected']

/** Map registries stored before the lifecycle was reduced to four statuses. */
function normalizeStatus(status: string): PlateLifecycleStatus {
  if ((VALID_STATUSES as string[]).includes(status)) return status as PlateLifecycleStatus
  return 'Pending'
}

export function loadPlateRegistry(): PlateRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return PLATE_REGISTRY_MOCK
    const parsed = JSON.parse(raw) as PlateRecord[]
    if (!Array.isArray(parsed) || parsed.length === 0) return PLATE_REGISTRY_MOCK
    return parsed.map((plate) => ({ ...plate, status: normalizeStatus(plate.status) }))
  } catch {
    return PLATE_REGISTRY_MOCK
  }
}

export function savePlateRegistry(registry: PlateRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry))
  } catch {
    // Ignore quota / private-mode errors in prototype.
  }
}

export function resetPlateRegistry(): PlateRecord[] {
  localStorage.removeItem(STORAGE_KEY)
  return PLATE_REGISTRY_MOCK
}

/** "5 Aug 2026, 4:10 PM" — audit trails are read chronologically, so keep date and time together. */
export function formatAuditTimestamp(iso: string): string {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return iso
  return new Date(parsed).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function createAuditEvent(
  action: PlateAuditAction,
  summary: string,
  detail?: string,
  sampleIds?: string[],
): PlateAuditEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    actor: CURRENT_USER.name,
    actorRole: CURRENT_USER.role,
    timestamp: new Date().toISOString(),
    summary,
    detail,
    sampleIds,
  }
}

/** Append an event to one plate's trail without mutating the registry in place. */
export function appendAuditEvent(
  registry: PlateRecord[],
  plateId: string,
  eventInput: PlateAuditEvent,
  patch?: Partial<PlateRecord>,
): PlateRecord[] {
  return registry.map((plate) =>
    plate.plateId.toUpperCase() === plateId.toUpperCase()
      ? { ...plate, ...patch, auditTrail: [...plate.auditTrail, eventInput] }
      : plate,
  )
}

function nextCapaId(registry: PlateRecord[]): string {
  const year = new Date().getFullYear()
  const used = registry
    .flatMap((p) => p.capa)
    .map((c) => Number(c.id.split('-').pop()))
    .filter((n) => Number.isFinite(n)) as number[]
  const next = (used.length > 0 ? Math.max(...used) : 0) + 1
  return `CAPA-${year}-${String(next).padStart(3, '0')}`
}

/** Attach a new CAPA to a plate and record the matching audit event. */
export function addCapaToPlate(
  registry: PlateRecord[],
  plateId: string,
  form: CapaFormData,
  qcFailureSummary: string,
): { registry: PlateRecord[]; capaId: string } {
  const capaId = nextCapaId(registry)
  const record: CapaRecord = {
    id: capaId,
    plateId,
    raisedBy: CURRENT_USER.name,
    raisedAt: new Date().toISOString(),
    qcFailureSummary,
    rootCause: form.rootCause,
    correctiveAction: form.correctiveAction,
    preventiveAction: form.preventiveAction,
    status: form.status,
    ...(form.status === 'Closed'
      ? { closedBy: CURRENT_USER.name, closedAt: new Date().toISOString() }
      : {}),
  }

  const withCapa = registry.map((plate) =>
    plate.plateId.toUpperCase() === plateId.toUpperCase()
      ? { ...plate, capa: [...plate.capa, record] }
      : plate,
  )

  return {
    registry: appendAuditEvent(
      withCapa,
      plateId,
      createAuditEvent(
        'capa-raised',
        `${capaId} raised against QC failure`,
        form.rootCause ? `Root cause recorded as: ${form.rootCause}` : 'Raised without a root cause recorded.',
      ),
    ),
    capaId,
  }
}

export interface SampleTraceHit {
  plate: PlateRecord
  sample: PlateSampleRef
}

/**
 * Trace a query back to its plate. Matches Plate ID and Sample ID (and accession
 * number), so a reported issue can be looked up by whichever identifier the team has.
 */
export function tracePlates(
  registry: PlateRecord[],
  query: string,
): { plates: PlateRecord[]; sampleHits: SampleTraceHit[] } {
  const q = query.trim().toLowerCase()
  if (!q) return { plates: registry, sampleHits: [] }

  const sampleHits: SampleTraceHit[] = []
  const matched = new Map<string, PlateRecord>()

  for (const plate of registry) {
    if (plate.plateId.toLowerCase().includes(q)) {
      matched.set(plate.plateId, plate)
    }
    for (const sample of plate.samples) {
      if (
        sample.sampleId.toLowerCase().includes(q) ||
        sample.accessionNumber.toLowerCase().includes(q) ||
        sample.patient.toLowerCase().includes(q)
      ) {
        sampleHits.push({ plate, sample })
        matched.set(plate.plateId, plate)
      }
    }
  }

  return { plates: [...matched.values()], sampleHits }
}
