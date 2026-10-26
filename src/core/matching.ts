import type { Corrections, Cup, Entry, EntryOverride, Person } from './types'
import { normalizeName } from './normalize'

export function applyOverride(entry: Entry, override: EntryOverride | undefined): Entry {
  if (!override) return entry
  return {
    ...entry,
    firstname: override.firstname ?? entry.firstname,
    lastname: override.lastname ?? entry.lastname,
    birthYear: override.birthYear ?? entry.birthYear,
    gender: override.gender ?? entry.gender,
  }
}

/** Key for automatic matching: normalized name + birth year + gender. */
export function autoKey(e: Entry): string {
  return `${normalizeName(e.lastname)}|${normalizeName(e.firstname)}|${e.birthYear}|${e.gender}`
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`
}

/** All entries of all cups, sorted by cup date, with the operator's overrides applied. */
export function effectiveEntries(cups: Cup[], corrections: Corrections): Entry[] {
  return [...cups]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((cup) => cup.entries.map((e) => applyOverride(e, corrections.overrides[e.key])))
}

/**
 * Groups entries into persons: first the operator's merges, then automatic matches.
 * A group never contains two entries of the same cup or a pair the operator separated.
 */
export function buildPersons(cups: Cup[], corrections: Corrections): Person[] {
  const entries = effectiveEntries(cups, corrections)
  const cupDate = new Map(cups.map((c) => [c.id, c.date]))
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const separated = new Set(corrections.separations.map(([a, b]) => pairKey(a, b)))

  const groupOf = new Map<string, Entry[]>(entries.map((e) => [e.key, [e]]))

  const tryUnion = (a: string, b: string): boolean => {
    const ga = groupOf.get(a)
    const gb = groupOf.get(b)
    if (!ga || !gb || ga === gb) return ga === gb && !!ga
    const cups = new Set(ga.map((e) => e.cupId))
    if (gb.some((e) => cups.has(e.cupId))) return false
    for (const x of ga) for (const y of gb) if (separated.has(pairKey(x.key, y.key))) return false
    const merged = [...ga, ...gb]
    for (const e of merged) groupOf.set(e.key, merged)
    return true
  }

  for (const [a, b] of corrections.merges) {
    if (byKey.has(a) && byKey.has(b)) tryUnion(a, b)
  }

  const byAutoKey = new Map<string, Entry[]>()
  for (const e of entries) {
    const k = autoKey(e)
    byAutoKey.set(k, [...(byAutoKey.get(k) ?? []), e])
  }
  for (const group of byAutoKey.values()) {
    for (let i = 1; i < group.length; i++) {
      for (let j = 0; j < i; j++) {
        if (tryUnion(group[j].key, group[i].key)) break
      }
    }
  }

  const persons: Person[] = []
  for (const group of new Set(groupOf.values())) {
    const sorted = [...group].sort((a, b) => (cupDate.get(a.cupId) ?? '').localeCompare(cupDate.get(b.cupId) ?? ''))
    const latest = sorted[sorted.length - 1]
    persons.push({
      id: sorted[0].key,
      entries: sorted,
      firstname: latest.firstname,
      lastname: latest.lastname,
      birthYear: latest.birthYear,
      gender: latest.gender,
      clubName: latest.clubName,
    })
  }
  return persons.sort((a, b) => personSortKey(a).localeCompare(personSortKey(b), 'de'))
}

function personSortKey(p: Person): string {
  return `${normalizeName(p.lastname)} ${normalizeName(p.firstname)}`
}

export function sharesCup(a: Person, b: Person): boolean {
  const cups = new Set(a.entries.map((e) => e.cupId))
  return b.entries.some((e) => cups.has(e.cupId))
}
