/** Lower case, without accents, ß → ss, hyphens and repeated whitespace collapsed. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[-'’.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(name: string): string[] {
  return normalizeName(name).split(' ').filter(Boolean)
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** 1 = equal, 0 = completely different */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max
}

/** Name parts that are probably the same: typo, accent, or shortened (Tim/Timm). */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length >= 3 && long.startsWith(short)) return true
  return similarity(a, b) >= 0.8
}

/**
 * True if every name part of one person has a distinct matching part in the other's name.
 * Order-insensitive, so it also covers swapped first/last names, extra first names
 * (Florian ⊂ Florian Matteo) and name prefixes (Vries ⊂ De Vries).
 */
export function namesSimilar(a: string[], b: string[]): boolean {
  const [few, many] = a.length <= b.length ? [a, b] : [b, a]
  if (few.length === 0) return false
  const used = new Set<number>()
  for (const t of few) {
    const idx = many.findIndex((u, i) => !used.has(i) && tokensMatch(t, u))
    if (idx < 0) return false
    used.add(idx)
  }
  return true
}
