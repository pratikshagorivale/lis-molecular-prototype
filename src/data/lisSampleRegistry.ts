export interface LisSampleRecord {
  patient: string
  panel: string
}

const DEFAULT_REGISTRY: Record<string, LisSampleRecord> = {
  '000727425': { patient: 'Pratiksha Gorivale', panel: 'UTI Panel' },
  '000727420': { patient: 'John Smith', panel: 'UTI Panel' },
  '000727431': { patient: 'Maria Garcia', panel: 'UTI Panel' },
}

let registry: Record<string, LisSampleRecord> = { ...DEFAULT_REGISTRY }
let loaded = false

export async function loadLisRegistry(): Promise<void> {
  if (loaded) return
  try {
    const res = await fetch('/demo/lis-samples.json')
    if (res.ok) {
      const data = (await res.json()) as Record<string, LisSampleRecord>
      registry = { ...DEFAULT_REGISTRY, ...data }
    }
  } catch {
    // use defaults
  }
  loaded = true
}

export function lookupSample(sampleId: string): LisSampleRecord | null {
  const key = sampleId.trim()
  return registry[key] ?? null
}

export function isControlSample(sampleId: string): boolean {
  const id = sampleId.trim().toUpperCase()
  return ['PC', 'NC', 'NTC', 'POS', 'NEG', 'POSITIVE CONTROL', 'NEGATIVE CONTROL'].includes(id)
    || id.includes('CONTROL')
    || /^(PC|NC|NTC|IC)\b/.test(id)
}

export function isUnknownSample(sampleId: string): boolean {
  return /UNKNOWN/i.test(sampleId.trim())
}
