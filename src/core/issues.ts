import type { Corrections, Person } from './types'
import { normalizeName, namesSimilar, similarity, tokens } from './normalize'
import { pairKey, sharesCup } from './matching'

export type IssueType = 'swapped' | 'birthyear' | 'gender' | 'birthdate' | 'similar' | 'inconsistent'

export interface Issue {
  /** stable as long as the involved persons keep their first entry */
  id: string
  type: IssueType
  persons: Person[]
  /** human readable differences, German */
  details: string[]
}

export const ISSUE_LABELS: Record<IssueType, string> = {
  swapped: 'Vor-/Nachname vertauscht',
  birthyear: 'Jahrgang unterschiedlich',
  gender: 'Geschlecht unterschiedlich',
  birthdate: 'Gleiches Geburtsdatum',
  similar: 'Ähnlicher Name',
  inconsistent: 'Widersprüchliche Angaben',
}

const ORDER: IssueType[] = ['inconsistent', 'swapped', 'gender', 'birthyear', 'birthdate', 'similar']

function differences(a: Person, b: Person): string[] {
  const d: string[] = []
  if (normalizeName(a.lastname) !== normalizeName(b.lastname) || normalizeName(a.firstname) !== normalizeName(b.firstname)) {
    d.push(`Name: ${a.lastname} ${a.firstname} / ${b.lastname} ${b.firstname}`)
  } else if (a.lastname !== b.lastname || a.firstname !== b.firstname) {
    d.push(`Schreibweise: ${a.lastname} ${a.firstname} / ${b.lastname} ${b.firstname}`)
  }
  if (a.birthYear !== b.birthYear) d.push(`Jahrgang: ${a.birthYear} / ${b.birthYear}`)
  if (a.gender !== b.gender) d.push(`Geschlecht: ${a.gender} / ${b.gender}`)
  const shared = sharedBirthdate(a, b)
  if (shared) d.push(`Geburtsdatum: ${shared}`)
  return d
}

/** `YYYY-01-01` is a common placeholder in the result files, so it says nothing about identity. */
function realBirthdates(p: Person): Set<string> {
  return new Set(p.entries.map((e) => e.birthdate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !d.endsWith('-01-01')))
}

function sharedBirthdate(a: Person, b: Person): string | undefined {
  const dates = realBirthdates(a)
  return [...realBirthdates(b)].find((d) => dates.has(d))
}

function classifyPair(a: Person, b: Person): IssueType | null {
  const al = normalizeName(a.lastname)
  const af = normalizeName(a.firstname)
  const bl = normalizeName(b.lastname)
  const bf = normalizeName(b.firstname)
  if (al === bl && af === bf) {
    // same name but not auto-matched, so birth year or gender differ
    return a.gender !== b.gender ? 'gender' : 'birthyear'
  }
  if (al === bf && af === bl) return 'swapped'
  const yearClose = Math.abs(a.birthYear - b.birthYear) <= 1
  if (a.gender === b.gender && yearClose && namesSimilar(tokens(`${a.lastname} ${a.firstname}`), tokens(`${b.lastname} ${b.firstname}`))) {
    return 'similar'
  }
  // same first name, last name with a typo beyond the token threshold (Brunner/Brummer)
  if (af === bf && a.gender === b.gender && yearClose && similarity(al, bl) >= 0.6) return 'similar'
  // same exact birthdate and one name part equal: a nickname (Sepp/Josef) or a badly misspelt last name
  if (a.gender === b.gender && (al === bl || af === bf) && sharedBirthdate(a, b)) return 'birthdate'
  return null
}

function inconsistency(p: Person): string[] {
  // accent and case variants are matched automatically on purpose, so they are not reported
  const names = new Map(p.entries.map((e) => [normalizeName(`${e.lastname} ${e.firstname}`), `${e.lastname} ${e.firstname}`]))
  const years = new Set(p.entries.map((e) => e.birthYear))
  const genders = new Set(p.entries.map((e) => e.gender))
  const d: string[] = []
  if (names.size > 1) d.push(`Namen: ${[...names.values()].join(' / ')}`)
  if (years.size > 1) d.push(`Jahrgänge: ${[...years].join(' / ')}`)
  if (genders.size > 1) d.push(`Geschlecht: ${[...genders].join(' / ')}`)
  return d
}

/** Suspicious persons and pairs of persons the operator should check. */
export function findIssues(persons: Person[], corrections: Corrections): Issue[] {
  const separated = new Set(corrections.separations.map(([a, b]) => pairKey(a, b)))
  const isSeparated = (a: Person, b: Person) =>
    a.entries.some((x) => b.entries.some((y) => separated.has(pairKey(x.key, y.key))))

  const issues: Issue[] = []
  for (const p of persons) {
    const details = inconsistency(p)
    if (details.length) issues.push({ id: `inconsistent:${p.id}`, type: 'inconsistent', persons: [p], details })
  }
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const a = persons[i]
      const b = persons[j]
      if (sharesCup(a, b)) continue
      const type = classifyPair(a, b)
      if (!type || isSeparated(a, b)) continue
      issues.push({ id: `${type}:${pairKey(a.id, b.id)}`, type, persons: [a, b], details: differences(a, b) })
    }
  }
  return issues.sort((x, y) => ORDER.indexOf(x.type) - ORDER.indexOf(y.type))
}
