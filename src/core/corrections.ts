import type { Corrections, EntryOverride, Gender, Person } from './types'
import { pairKey } from './matching'

export function emptyCorrections(): Corrections {
  return { format: 'beocup-corrections', version: 1, merges: [], separations: [], overrides: {}, settings: { cupsPerYear: 5 } }
}

/** Validates an imported corrections file; throws a German message if it is not usable. */
export function parseCorrections(json: string): Corrections {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.')
  }
  const c = data as Partial<Corrections>
  if (c?.format !== 'beocup-corrections' || c.version !== 1) {
    throw new Error('Die Datei ist keine BEO-Cup Korrektur-Datei.')
  }
  const isPairList = (v: unknown) =>
    Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((k) => typeof k === 'string'))
  if (!isPairList(c.merges) || !isPairList(c.separations) || typeof c.overrides !== 'object' || c.overrides === null) {
    throw new Error('Die Korrektur-Datei ist beschädigt.')
  }
  return { ...emptyCorrections(), ...c, settings: { ...emptyCorrections().settings, ...c.settings } } as Corrections
}

export interface CanonicalValues {
  firstname: string
  lastname: string
  birthYear: number
  gender: Gender
}

function removePairs(list: [string, string][], drop: (a: string, b: string) => boolean): [string, string][] {
  return list.filter(([a, b]) => !drop(a, b))
}

/** Writes the same name, birth year and gender to all given entries. */
function setCanonical(c: Corrections, keys: string[], values: CanonicalValues): Corrections {
  const overrides = { ...c.overrides }
  for (const k of keys) overrides[k] = { ...overrides[k], ...values }
  return { ...c, overrides }
}

/** Operator says: these persons are the same swimmer. */
export function mergePersons(c: Corrections, persons: Person[], values: CanonicalValues): Corrections {
  const keys = persons.flatMap((p) => p.entries.map((e) => e.key))
  const keySet = new Set(keys)
  const separations = removePairs(c.separations, (a, b) => keySet.has(a) && keySet.has(b))
  const merges = [...c.merges]
  for (let i = 1; i < persons.length; i++) merges.push([persons[0].entries[0].key, persons[i].entries[0].key])
  return setCanonical({ ...c, merges, separations }, keys, values)
}

/** Operator says: these persons are different swimmers – never suggest them again. */
export function separatePersons(c: Corrections, a: Person, b: Person): Corrections {
  const existing = new Set(c.separations.map(([x, y]) => pairKey(x, y)))
  const pair: [string, string] = [a.entries[0].key, b.entries[0].key]
  if (existing.has(pairKey(...pair))) return c
  return { ...c, separations: [...c.separations, pair] }
}

/** Removes one entry from its person; it will not be grouped with those entries again. */
export function detachEntry(c: Corrections, person: Person, entryKey: string): Corrections {
  const others = person.entries.map((e) => e.key).filter((k) => k !== entryKey)
  const otherSet = new Set(others)
  const merges = removePairs(c.merges, (a, b) => (a === entryKey && otherSet.has(b)) || (b === entryKey && otherSet.has(a)))
  // keep the remaining entries together even if a removed merge pair connected them through this entry
  for (let i = 1; i < others.length; i++) merges.push([others[0], others[i]])
  const separations = [...c.separations, ...others.map((k) => [entryKey, k] as [string, string])]
  return { ...c, merges, separations }
}

export function setOverride(c: Corrections, entryKey: string, override: EntryOverride): Corrections {
  const overrides = { ...c.overrides }
  const cleaned = Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined && v !== ''))
  if (Object.keys(cleaned).length) overrides[entryKey] = cleaned
  else delete overrides[entryKey]
  return { ...c, overrides }
}

/** Applies an override to every entry of a person (e.g. to fix a person-wide inconsistency). */
export function setPersonValues(c: Corrections, person: Person, values: CanonicalValues): Corrections {
  return setCanonical(c, person.entries.map((e) => e.key), values)
}
