export function normalizeTargetName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function expandInstrumentTargetName(name: string, catalogTargets: string[]): string[] {
  const result = new Set<string>([normalizeTargetName(name)])
  const match = name.trim().match(/^organism\s*(\d+)$/i)
  if (match) {
    const idx = parseInt(match[1], 10) - 1
    if (idx >= 0 && idx < catalogTargets.length) {
      result.add(normalizeTargetName(catalogTargets[idx]))
    }
  }
  return [...result]
}
