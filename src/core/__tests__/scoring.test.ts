import { describe, expect, it } from 'vitest'
import { buildPersons } from '../matching'
import { categoryForAge, computeRanking, scoreEntry } from '../scoring'
import { FOUR, corrections, cup, type FixtureAthlete } from './fixtures'

const SETTINGS = { cupsPerYear: 5 }

function athlete(overrides: Partial<FixtureAthlete>): FixtureAthlete {
  return { id: '1', first: 'Anna', last: 'Muster', birthdate: '2014-05-01', gender: 'F', results: FOUR, ...overrides }
}

function rank(cups: ReturnType<typeof cup>[]) {
  return computeRanking(cups, buildPersons(cups, corrections()), SETTINGS)
}

function group(r: ReturnType<typeof rank>, category: string, gender: 'M' | 'F') {
  return r.groups.find((g) => g.category === category && g.gender === gender)!
}

describe('REQ 3 – categories', () => {
  it('maps age to Kat. V–I', () => {
    expect([8, 10, 11, 12, 13, 14, 15, 16, 17, 40].map(categoryForAge)).toEqual(['V', 'V', 'IV', 'IV', 'III', 'III', 'II', 'II', 'I', 'I'])
  })

  it('uses year of the cup minus birth year, fixed for the whole year', () => {
    // born late in the year: still 12 in the year 2026 → Kat. IV for every cup
    const a = athlete({ birthdate: '2014-12-31' })
    const r = rank([cup('Frutigen', '2026-03-15', [a]), cup('Thun', '2026-08-22', [a])])
    expect(group(r, 'IV', 'F').ranked).toHaveLength(1)
  })

  it('ranks girls and boys separately: 10 groups', () => {
    const r = rank([cup('Thun', '2026-08-22', [athlete({ id: '1' }), athlete({ id: '2', first: 'Ben', gender: 'M' })])])
    expect(r.groups).toHaveLength(10)
    expect(group(r, 'IV', 'F').ranked.map((x) => x.person.firstname)).toEqual(['Anna'])
    expect(group(r, 'IV', 'M').ranked.map((x) => x.person.firstname)).toEqual(['Ben'])
  })
})

describe('REQ 4 – scoring per cup', () => {
  const entry = (results: FixtureAthlete['results']) => cup('Thun', '2026-08-22', [athlete({ results })]).entries[0]

  it('Kat. III–I: sum of all four strokes', () => {
    expect(scoreEntry(entry(FOUR), 'III')).toEqual({ kind: 'ok', total: 15800, counted: ['FREE', 'FLY', 'BACK', 'BREAST'] })
  })

  it('Kat. III–I: a missing stroke makes the cup invalid', () => {
    const { FLY: _, ...three } = FOUR
    expect(scoreEntry(entry(three), 'I')).toEqual({ kind: 'incomplete', validCount: 3 })
  })

  it('Kat. V/IV: the three fastest of four count (Fly counts if it is among them)', () => {
    // FLY 40, BACK 41, BREAST 42, FREE 35 → BREAST is dropped
    expect(scoreEntry(entry(FOUR), 'IV')).toMatchObject({ kind: 'ok', total: 11600 })
  })

  it('Kat. V/IV: three strokes without Fly are enough', () => {
    const { FLY: _, ...three } = FOUR
    expect(scoreEntry(entry(three), 'V')).toMatchObject({ kind: 'ok', total: 11800 })
  })

  it('Kat. V/IV: two valid times are not enough', () => {
    expect(scoreEntry(entry({ BACK: '41.00', FREE: '35.00' }), 'V')).toEqual({ kind: 'incomplete', validCount: 2 })
  })

  it('a DSQ adds the 3 s penalty to the swum time', () => {
    expect(scoreEntry(entry({ ...FOUR, BREAST: ['45.00', 'DSQ'] }), 'II')).toMatchObject({ kind: 'ok', total: 16400 })
  })

  it('Kat. V/IV: the penalty is applied before choosing the three best times', () => {
    // BACK 39.50 is the second fastest swum time, but 42.50 with the penalty – so it is dropped
    const o = scoreEntry(entry({ FLY: '40.00', BACK: ['39.50', 'DSQ'], BREAST: '41.00', FREE: '35.00' }), 'IV')
    expect(o).toEqual({ kind: 'ok', total: 11600, counted: ['FREE', 'FLY', 'BREAST'] })
  })

  it('DNS, DNF, WDR and zero times are not valid', () => {
    const results = { FLY: ['40.00', 'DNS'], BACK: ['0.00', ''], BREAST: ['42.00', 'DNF'], FREE: '35.00' } as FixtureAthlete['results']
    expect(scoreEntry(entry(results), 'III')).toEqual({ kind: 'incomplete', validCount: 1 })
  })

  it('a swimmer withdrawn from all races counts as withdrawn', () => {
    const results = { FLY: ['0.00', 'WDR'], BACK: ['0.00', 'WDR'], BREAST: ['0.00', 'WDR'], FREE: ['0.00', 'WDR'] } as FixtureAthlete['results']
    expect(scoreEntry(entry(results), 'III')).toEqual({ kind: 'withdrawn' })
  })

  it('no entry at a cup counts as absent', () => {
    expect(scoreEntry(undefined, 'III')).toEqual({ kind: 'absent' })
  })
})

describe('REQ 4 – yearly ranking', () => {
  const cupA = (as: FixtureAthlete[]) => cup('Frutigen', '2026-03-15', as)
  const cupB = (as: FixtureAthlete[]) => cup('Thun', '2026-08-22', as)

  it('sums the Gesamtzeiten of all cups and sorts ascending', () => {
    const fast = athlete({ id: '1', first: 'Fast', results: { ...FOUR, FREE: '30.00' } })
    const slow = athlete({ id: '2', first: 'Slow' })
    const r = rank([cupA([slow, fast]), cupB([slow, fast])])
    const ranked = group(r, 'IV', 'F').ranked
    expect(ranked.map((x) => [x.person.firstname, x.rank, x.total, x.gap])).toEqual([
      ['Fast', 1, 2 * 11100, 0],
      ['Slow', 2, 2 * 11600, 1000],
    ])
  })

  it('only swimmers with a valid Gesamtzeit at every cup are eligible', () => {
    const always = athlete({ id: '1', first: 'Always' })
    const once = athlete({ id: '2', first: 'Once' })
    const incomplete = athlete({ id: '3', first: 'Incomplete', results: { FREE: '35.00' } })
    const r = rank([cupA([always, once, incomplete]), cupB([always, incomplete])])
    const g = group(r, 'IV', 'F')
    expect(g.ranked.map((x) => x.person.firstname)).toEqual(['Always'])
    expect(g.notEligible.map((x) => [x.person.firstname, x.participated, x.outcomes.map((o) => o.kind)])).toEqual([
      ['Once', 1, ['ok', 'absent']],
      ['Incomplete', 0, ['incomplete', 'incomplete']],
    ])
  })

  it('equal totals share a rank (1, 2, 2, 4)', () => {
    const t = (id: string, free: string) => athlete({ id, first: `S${id}`, results: { ...FOUR, FREE: free } })
    const r = rank([cupA([t('1', '30.00'), t('2', '31.00'), t('3', '31.00'), t('4', '32.00')])])
    expect(group(r, 'IV', 'F').ranked.map((x) => x.rank)).toEqual([1, 2, 2, 4])
  })

  it('is marked as interim until all cups of the year are loaded', () => {
    const a = athlete({})
    expect(rank([cupA([a])]).final).toBe(false)
    const five = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'].map((d, i) => cup(`C${i}`, d, [a]))
    expect(rank(five).final).toBe(true)
  })

  it('orders cups by date regardless of load order', () => {
    const a = athlete({})
    expect(rank([cupB([a]), cupA([a])]).cups.map((c) => c.city)).toEqual(['Frutigen', 'Thun'])
  })
})
