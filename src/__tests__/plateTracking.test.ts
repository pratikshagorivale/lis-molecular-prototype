import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCapaToPlate,
  appendAuditEvent,
  closeCapaOnPlate,
  createAuditEvent,
  loadPlateRegistry,
  tracePlates,
} from '../utils/plateTracking'
import { PLATE_REGISTRY_MOCK } from '../data/plateTrackingMockData'
import { failuresFromControls } from '../utils/qcFailures'
import type { CapaFormData, PlateRecord } from '../types'

const FORM: CapaFormData = {
  rootCause: 'Cold-chain breach.',
  correctiveAction: '',
  preventiveAction: '',
  status: 'Open',
}

function registry(): PlateRecord[] {
  return JSON.parse(JSON.stringify(PLATE_REGISTRY_MOCK))
}

describe('tracePlates', () => {
  it('finds a plate by its own ID', () => {
    expect(tracePlates(registry(), 'PLATE 7').plates.map((p) => p.plateId)).toEqual(['PLATE 7'])
  })

  it('traces a sample ID back to the plate holding it', () => {
    const reg = registry()
    const sample = reg.find((p) => p.plateId === 'PLATE 7')!.samples[5]
    const { plates, sampleHits } = tracePlates(reg, sample.sampleId)
    expect(plates.map((p) => p.plateId)).toEqual(['PLATE 7'])
    expect(sampleHits[0].sample.wellId).toBe(sample.wellId)
  })

  it('matches case-insensitively', () => {
    expect(tracePlates(registry(), 'plate 7').plates).toHaveLength(1)
  })

  it('returns everything for a blank query', () => {
    expect(tracePlates(registry(), '   ').plates).toHaveLength(PLATE_REGISTRY_MOCK.length)
  })
})

describe('appendAuditEvent', () => {
  it('appends without mutating the previous registry', () => {
    const before = registry()
    const after = appendAuditEvent(before, 'PLATE 8', createAuditEvent('released', 'Released'))
    expect(after.find((p) => p.plateId === 'PLATE 8')!.auditTrail).toHaveLength(
      before.find((p) => p.plateId === 'PLATE 8')!.auditTrail.length + 1,
    )
  })

  it('matches the plate ID case-insensitively', () => {
    const after = appendAuditEvent(registry(), 'plate 8', createAuditEvent('released', 'Released'))
    expect(after.find((p) => p.plateId === 'PLATE 8')!.auditTrail.at(-1)!.summary).toBe('Released')
  })
})

describe('addCapaToPlate', () => {
  let reg: PlateRecord[]
  beforeEach(() => { reg = registry() })

  it('scopes the CAPA to the control it answers', () => {
    const plate = reg.find((p) => p.plateId === 'PLATE 9')!
    const [failure] = failuresFromControls(plate.qcControls)
    const { registry: next } = addCapaToPlate(reg, 'PLATE 9', FORM, failure)
    const capa = next.find((p) => p.plateId === 'PLATE 9')!.capa.at(-1)!
    expect(capa.control).toBe(failure.control)
    expect(capa.qcFailureSummary).toBe(failure.summary)
  })

  it('records one audit event per CAPA', () => {
    const plate = reg.find((p) => p.plateId === 'PLATE 9')!
    const failures = failuresFromControls(plate.qcControls)
    let next = reg
    for (const failure of failures) {
      next = addCapaToPlate(next, 'PLATE 9', FORM, failure).registry
    }
    const updated = next.find((p) => p.plateId === 'PLATE 9')!
    expect(updated.capa).toHaveLength(failures.length)
    expect(updated.auditTrail.filter((e) => e.action === 'capa-added')).toHaveLength(failures.length)
  })

  it('never reuses a CAPA id', () => {
    const plate = reg.find((p) => p.plateId === 'PLATE 9')!
    const failures = failuresFromControls(plate.qcControls)
    let next = reg
    const ids: string[] = []
    for (const failure of failures) {
      const result = addCapaToPlate(next, 'PLATE 9', FORM, failure)
      ids.push(result.capaId)
      next = result.registry
    }
    const allIds = next.flatMap((p) => p.capa.map((c) => c.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

describe('loadPlateRegistry', () => {
  beforeEach(() => localStorage.clear())

  it('falls back to the mock registry when storage is empty', () => {
    expect(loadPlateRegistry()).toHaveLength(PLATE_REGISTRY_MOCK.length)
  })

  it('repairs a record stored before controls were tracked', () => {
    const stale = registry().map((plate) => {
      const copy: Record<string, unknown> = { ...plate, status: 'In Validation' }
      delete copy.qcControls
      return copy
    })
    localStorage.setItem('lis-molecular-prototype:plate-registry', JSON.stringify(stale))
    const loaded = loadPlateRegistry()
    expect(loaded.every((p) => Array.isArray(p.qcControls))).toBe(true)
    expect(loaded.every((p) => p.status === 'Pending')).toBe(true)
  })
})

describe('closeCapaOnPlate', () => {
  it('closes only the named CAPA and records who closed it', () => {
    const reg = registry()
    const plate = reg.find((p) => p.plateId === 'PLATE 9')!
    const failures = failuresFromControls(plate.qcControls)
    let next = reg
    const ids: string[] = []
    for (const failure of failures) {
      const result = addCapaToPlate(next, 'PLATE 9', FORM, failure)
      ids.push(result.capaId)
      next = result.registry
    }

    next = closeCapaOnPlate(next, 'PLATE 9', ids[0])
    const capa = next.find((p) => p.plateId === 'PLATE 9')!.capa

    expect(capa.find((c) => c.id === ids[0])!.status).toBe('Closed')
    expect(capa.find((c) => c.id === ids[0])!.closedBy).toBeTruthy()
    expect(capa.find((c) => c.id === ids[1])!.status).toBe('Open')
  })

  it('leaves an already closed CAPA untouched', () => {
    const reg = registry()
    const closed = reg.find((p) => p.plateId === 'PLATE 7')!.capa[0]
    expect(closed.status).toBe('Closed')
    const next = closeCapaOnPlate(reg, 'PLATE 7', closed.id)
    expect(next.find((p) => p.plateId === 'PLATE 7')!.capa[0].closedAt).toBe(closed.closedAt)
  })

  it('does not add an audit event, since the trail records only CAPA creation', () => {
    const reg = registry()
    const before = reg.find((p) => p.plateId === 'MU1')!.auditTrail.length
    const next = closeCapaOnPlate(reg, 'MU1', reg.find((p) => p.plateId === 'MU1')!.capa[0].id)
    expect(next.find((p) => p.plateId === 'MU1')!.auditTrail).toHaveLength(before)
  })
})
