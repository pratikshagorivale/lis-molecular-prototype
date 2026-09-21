import { describe, expect, it } from 'vitest'
import { buildMolecularReport } from '../data/reportEntryMockData'
import { partiallyCompletedEntries } from '../data/waitingListMockData'

const entries = partiallyCompletedEntries
const report = buildMolecularReport(entries[0])

describe('a molecular report carries its released results', () => {
  it('reports a partially completed status, not an empty one', () => {
    expect(report.status).toBe('Partially Completed')
  })

  it('fills every gene, organism and resistance row', () => {
    const rows = [...report.genes, ...report.organisms, ...report.antibioticResistance]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.result, `${row.name} has no result`).not.toBe('')
      expect(row.interpretation, `${row.name} has no interpretation`).not.toBe('')
    }
  })

  it('reports a viral load only where the organism amplified', () => {
    for (const organism of report.organisms) {
      if (organism.interpretation === 'Detected') {
        expect(organism.viralLoad).toMatch(/copies\/mL$/)
      } else {
        expect(organism.viralLoad).toBe('')
      }
    }
  })

  it('names the antibiotic each resistance row answers', () => {
    for (const row of report.antibioticResistance) {
      expect(row.antibioticName).not.toBe('')
      expect(['Resistant', 'Sensitive']).toContain(row.interpretation)
    }
  })
})

describe('results belong to one patient', () => {
  it('is stable across rebuilds for the same sample', () => {
    expect(buildMolecularReport(entries[0])).toEqual(buildMolecularReport(entries[0]))
  })

  it('differs between patients, so one report is never shown as another', () => {
    const shapes = entries.map((entry) =>
      JSON.stringify(buildMolecularReport(entry).organisms.map((o) => [o.result, o.interpretation])),
    )
    expect(new Set(shapes).size).toBeGreaterThan(1)
  })
})
