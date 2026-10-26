import type { Cup, Entry, Gender, Person, Settings, Stroke } from './types'
import { STROKES } from './types'

export type Category = 'V' | 'IV' | 'III' | 'II' | 'I'

/** youngest first, as in the Reglement's table read bottom-up */
export const CATEGORIES: Category[] = ['V', 'IV', 'III', 'II', 'I']

export function categoryForAge(age: number): Category {
  if (age <= 10) return 'V'
  if (age <= 12) return 'IV'
  if (age <= 14) return 'III'
  if (age <= 16) return 'II'
  return 'I'
}

/** Kat. V and IV swim a Dreikampf: the 3 best of up to 4 strokes count. */
export function countedStrokes(category: Category): number {
  return category === 'V' || category === 'IV' ? 3 : 4
}

const INVALID_STATUS = new Set(['DNS', 'DNF', 'WDR'])

export function isValidResult(r: { time: number; status: string } | undefined): boolean {
  return !!r && r.time > 0 && !INVALID_STATUS.has(r.status)
}

/** Reglement section 2: a disqualification adds 3 seconds (the LENEX swimtime does not include it). */
export const DSQ_PENALTY = 300

export function effectiveTime(r: { time: number; status: string }): number {
  return r.time + (r.status === 'DSQ' ? DSQ_PENALTY : 0)
}

export type CupOutcome =
  | { kind: 'ok'; total: number; counted: Stroke[] }
  | { kind: 'absent' }
  | { kind: 'withdrawn' }
  | { kind: 'exhibition' }
  | { kind: 'incomplete'; validCount: number }

export function scoreEntry(entry: Entry | undefined, category: Category): CupOutcome {
  if (!entry) return { kind: 'absent' }
  // Reglement 2026 §1: squad swimmers of Kat. I/II start "ausser Konkurrenz" (SPLASH status EXH)
  if (STROKES.some((s) => entry.results[s]?.status === 'EXH')) return { kind: 'exhibition' }
  const valid = STROKES.filter((s) => isValidResult(entry.results[s]))
    .map((s) => ({ stroke: s, time: effectiveTime(entry.results[s]!) }))
    .sort((a, b) => a.time - b.time)
  const needed = countedStrokes(category)
  if (valid.length < needed) {
    const anyStart = STROKES.some((s) => {
      const r = entry.results[s]
      return r && r.status !== 'WDR' && r.status !== 'DNS'
    })
    return valid.length === 0 && !anyStart ? { kind: 'withdrawn' } : { kind: 'incomplete', validCount: valid.length }
  }
  const counted = valid.slice(0, needed)
  return { kind: 'ok', total: counted.reduce((sum, r) => sum + r.time, 0), counted: counted.map((r) => r.stroke) }
}

export interface RankingRow {
  person: Person
  /** aligned with Ranking.cups */
  outcomes: CupOutcome[]
  total: number | null
  rank: number | null
  /** hundredths behind the leader */
  gap: number | null
  participated: number
}

export interface RankingGroup {
  category: Category
  gender: Gender
  ranked: RankingRow[]
  notEligible: RankingRow[]
}

export interface Ranking {
  year: number
  cups: Cup[]
  cupsPerYear: number
  final: boolean
  groups: RankingGroup[]
}

export function computeRanking(cups: Cup[], persons: Person[], settings: Settings): Ranking {
  const sortedCups = [...cups].sort((a, b) => a.date.localeCompare(b.date))
  const year = Math.max(0, ...sortedCups.map((c) => c.year))
  const groups = new Map<string, RankingGroup>()
  for (const category of CATEGORIES) {
    for (const gender of ['F', 'M'] as Gender[]) {
      groups.set(`${category}${gender}`, { category, gender, ranked: [], notEligible: [] })
    }
  }

  for (const person of persons) {
    const category = categoryForAge(year - person.birthYear)
    const byCup = new Map(person.entries.map((e) => [e.cupId, e]))
    const outcomes = sortedCups.map((c) => scoreEntry(byCup.get(c.id), category))
    const ok = outcomes.filter((o) => o.kind === 'ok')
    const row: RankingRow = {
      person,
      outcomes,
      total: ok.length === outcomes.length && ok.length > 0 ? ok.reduce((s, o) => s + o.total, 0) : null,
      rank: null,
      gap: null,
      participated: ok.length,
    }
    const group = groups.get(`${category}${person.gender}`)!
    if (row.total !== null) group.ranked.push(row)
    else group.notEligible.push(row)
  }

  for (const group of groups.values()) {
    group.ranked.sort((a, b) => a.total! - b.total!)
    group.ranked.forEach((row, i) => {
      const prev = group.ranked[i - 1]
      row.rank = prev && prev.total === row.total ? prev.rank : i + 1
      row.gap = row.total! - group.ranked[0].total!
    })
    group.notEligible.sort((a, b) => b.participated - a.participated || a.person.lastname.localeCompare(b.person.lastname, 'de'))
  }

  return {
    year,
    cups: sortedCups,
    cupsPerYear: settings.cupsPerYear,
    final: sortedCups.length >= settings.cupsPerYear,
    groups: [...groups.values()],
  }
}
