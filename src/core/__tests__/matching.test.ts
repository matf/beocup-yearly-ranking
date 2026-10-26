import { describe, expect, it } from 'vitest'
import { buildPersons } from '../matching'
import { findIssues } from '../issues'
import { detachEntry, emptyCorrections, mergePersons, parseCorrections, separatePersons, setOverride, setPersonValues } from '../corrections'
import { normalizeName, namesSimilar, tokens } from '../normalize'
import type { Corrections } from '../types'
import { FOUR, corrections, cup, type FixtureAthlete } from './fixtures'

const a = (id: string, first: string, last: string, birthdate: string, gender: 'M' | 'F' = 'F', club = 'INT'): FixtureAthlete => ({
  id, first, last, birthdate, gender, club, results: FOUR,
})

const C1 = (as: FixtureAthlete[]) => cup('Frutigen', '2026-03-15', as)
const C2 = (as: FixtureAthlete[]) => cup('Aeschi', '2026-05-17', as)
const C3 = (as: FixtureAthlete[]) => cup('Thun', '2026-08-22', as)

function issuesFor(cups: ReturnType<typeof cup>[], c: Corrections = corrections()) {
  return findIssues(buildPersons(cups, c), c)
}

describe('REQ 5.1 – automatic matching', () => {
  it('normalizes case, accents, ß and hyphens', () => {
    expect(normalizeName('  Novák ')).toBe('novak')
    expect(normalizeName('Bürgi-Ophélie')).toBe('burgi ophelie')
    expect(normalizeName('Strauß')).toBe('strauss')
  })

  it('matches entries with equal normalized name, birth year and gender', () => {
    const cups = [C1([a('1', 'Jan', 'Novák', '2016-02-11', 'M')]), C2([a('7', 'jan', 'Novak', '2016-01-01', 'M', 'INTE')])]
    const persons = buildPersons(cups, corrections())
    expect(persons).toHaveLength(1)
    expect(persons[0].entries).toHaveLength(2)
  })

  it('ignores placeholder birthdates and club codes', () => {
    const cups = [C1([a('1', 'Simon', 'Hofstetter', '2014-01-01', 'M', 'INT')]), C3([a('2', 'Simon', 'Hofstetter', '2014-09-03', 'M', 'INTE')])]
    expect(buildPersons(cups, corrections())).toHaveLength(1)
  })

  it('never merges two entries of the same cup (twins)', () => {
    const twins = [a('1', 'Lea', 'Zbinden', '2014-11-19'), a('2', 'Lea', 'Zbinden', '2014-11-19')]
    expect(buildPersons([C1(twins)], corrections())).toHaveLength(2)
  })

  it('does not match different birth years or genders automatically', () => {
    const cups = [C1([a('1', 'Sam', 'Meier', '2014-01-01', 'M')]), C2([a('2', 'Sam', 'Meier', '2015-01-01', 'M')]), C3([a('3', 'Sam', 'Meier', '2014-01-01', 'F')])]
    expect(buildPersons(cups, corrections())).toHaveLength(3)
  })

  it('shows name and club of the most recent cup', () => {
    const cups = [C3([a('2', 'Timm', 'Gerber', '2015-04-08', 'M', 'NEW')]), C1([a('1', 'Timm', 'Gerber', '2015-04-08', 'M', 'OLD')])]
    expect(buildPersons(cups, corrections())[0].clubName).toBe('Club NEW')
  })
})

describe('REQ 5.2 – suspicious entries', () => {
  it('detects swapped first and last name', () => {
    const issues = issuesFor([C1([a('1', 'Muster', 'Anna', '2014-01-01')]), C2([a('2', 'Anna', 'Muster', '2014-01-01')])])
    expect(issues.map((i) => i.type)).toEqual(['swapped'])
  })

  it('detects a differing birth year', () => {
    const issues = issuesFor([C1([a('1', 'Anna', 'Muster', '2014-01-01')]), C2([a('2', 'Anna', 'Muster', '2013-03-05')])])
    expect(issues.map((i) => i.type)).toEqual(['birthyear'])
    expect(issues[0].details).toContain('Jahrgang: 2014 / 2013')
  })

  it('detects a differing gender', () => {
    const issues = issuesFor([C1([a('1', 'Kim', 'Muster', '2014-01-01', 'F')]), C2([a('2', 'Kim', 'Muster', '2014-01-01', 'M')])])
    expect(issues.map((i) => i.type)).toEqual(['gender'])
  })

  it.each([
    ['typo', ['Timm', 'Gerber'], ['Tim', 'Gerber']],
    ['name prefix and typo', ['Anneliese', 'Vries'], ['Annelies', 'De Vries']],
    ['additional first name', ['Florian', 'Ammann'], ['Florian Matteo', 'Ammann']],
    ['double last name', ['Aiko', 'Meier Huber'], ['Aiko', 'Meier']],
  ])('detects similar names: %s', (_, [f1, l1], [f2, l2]) => {
    const issues = issuesFor([C1([a('1', f1, l1, '2015-01-01')]), C2([a('2', f2, l2, '2015-04-08')])])
    expect(issues.map((i) => i.type)).toEqual(['similar'])
  })

  it('does not report different names, siblings of different age, or persons sharing a cup', () => {
    const issues = issuesFor([
      C1([a('1', 'Selina', 'Zbinden', '2014-11-19'), a('2', 'Jolanda', 'Zbinden', '2014-11-19'), a('3', 'Timm', 'Gerber', '2015-01-01')]),
      C2([a('4', 'Selina', 'Zbinden', '2014-11-19'), a('5', 'Anna', 'Gerber', '2010-01-01')]),
    ])
    expect(issues).toEqual([])
  })

  it('reports a person whose entries disagree (after a manual merge)', () => {
    const cups = [C1([a('1', 'Anna', 'Muster', '2014-01-01')]), C2([a('2', 'Anna', 'Mustermann', '2014-01-01')])]
    const c: Corrections = { ...corrections(), merges: [[cups[0].entries[0].key, cups[1].entries[0].key]] }
    expect(issuesFor(cups, c).map((i) => i.type)).toEqual(['inconsistent'])
  })

  it('does not report accent-only spelling variants of an auto-matched person', () => {
    expect(issuesFor([C1([a('1', 'Jan', 'Novák', '2016-02-11', 'M')]), C2([a('2', 'Jan', 'Novak', '2016-01-01', 'M')])])).toEqual([])
  })

  it('name similarity is order-insensitive', () => {
    expect(namesSimilar(tokens('Muster Anna'), tokens('Anna Muster'))).toBe(true)
    expect(namesSimilar(tokens('Zbinden Selina'), tokens('Zbinden Jolanda'))).toBe(false)
  })
})

describe('REQ 5.2/5.3 – operator decisions', () => {
  const cups = () => [C1([a('1', 'Tim', 'Gerber', '2015-04-08', 'M')]), C2([a('2', 'Timm', 'Gerber', '2015-04-08', 'M')])]

  it('merge as same person: one person with the chosen values, issue resolved', () => {
    const cs = cups()
    const persons = buildPersons(cs, corrections())
    const c = mergePersons(corrections(), cs, persons, { firstname: 'Timm', lastname: 'Gerber', birthYear: 2015, gender: 'M' })
    const merged = buildPersons(cs, c)
    expect(merged).toHaveLength(1)
    expect(merged[0].entries.every((e) => e.firstname === 'Timm')).toBe(true)
    expect(findIssues(merged, c)).toEqual([])
  })

  it('merge stores only values that differ from the file', () => {
    const cs = cups()
    const c = mergePersons(corrections(), cs, buildPersons(cs, corrections()), { firstname: 'Timm', lastname: 'Gerber', birthYear: 2015, gender: 'M' })
    expect(c.overrides).toEqual({ [cs[0].entries[0].key]: { firstname: 'Timm' } })
  })

  it('different persons: the pair is not reported again', () => {
    const cs = cups()
    const [p1, p2] = buildPersons(cs, corrections())
    const c = separatePersons(corrections(), p1, p2)
    expect(issuesFor(cs, c)).toEqual([])
  })

  it('editing an entry can create an automatic match', () => {
    const cs = cups()
    const c = setOverride(corrections(), cs[0].entries[0].key, { firstname: 'Timm' })
    expect(buildPersons(cs, c)).toHaveLength(1)
  })

  it('clearing an override restores the file values', () => {
    const cs = cups()
    const key = cs[0].entries[0].key
    const c = setOverride(setOverride(corrections(), key, { firstname: 'Timm' }), key, {})
    expect(c.overrides[key]).toBeUndefined()
  })

  it('detaching an entry splits it off and keeps it apart', () => {
    const cs = [C1([a('1', 'Timm', 'Gerber', '2015-04-08', 'M')]), C2([a('2', 'Timm', 'Gerber', '2015-04-08', 'M')]), C3([a('3', 'Timm', 'Gerber', '2015-04-08', 'M')])]
    const [person] = buildPersons(cs, corrections())
    const c = detachEntry(corrections(), person, cs[1].entries[0].key)
    const after = buildPersons(cs, c)
    expect(after.map((p) => p.entries.length).sort()).toEqual([1, 2])
  })

  it('a merge across the same cup is refused', () => {
    const cs = [C1([a('1', 'Lea', 'Zbinden', '2014-11-19'), a('2', 'Lena', 'Zbinden', '2014-11-19')])]
    const c: Corrections = { ...corrections(), merges: [[cs[0].entries[0].key, cs[0].entries[1].key]] }
    expect(buildPersons(cs, c)).toHaveLength(2)
  })

  it('person-wide values fix an inconsistency', () => {
    const cs = [C1([a('1', 'Anna', 'Muster', '2014-01-01')]), C2([a('2', 'Anna', 'Mustermann', '2014-01-01')])]
    let c: Corrections = { ...corrections(), merges: [[cs[0].entries[0].key, cs[1].entries[0].key]] }
    const [p] = buildPersons(cs, c)
    c = setPersonValues(c, cs, p, { firstname: 'Anna', lastname: 'Muster', birthYear: 2014, gender: 'F' })
    expect(issuesFor(cs, c)).toEqual([])
  })

  it('decisions stay valid when a new cup is added', () => {
    const cs = cups()
    const c = mergePersons(corrections(), cs, buildPersons(cs, corrections()), { firstname: 'Timm', lastname: 'Gerber', birthYear: 2015, gender: 'M' })
    const withNew = [...cs, C3([a('9', 'Timm', 'Gerber', '2015-04-08', 'M')])]
    const persons = buildPersons(withNew, c)
    expect(persons).toHaveLength(1)
    expect(persons[0].entries).toHaveLength(3)
  })
})

describe('REQ 5.4 – corrections file', () => {
  it('round-trips through JSON', () => {
    const c = { ...emptyCorrections(), merges: [['a:1', 'b:2']] as [string, string][], settings: { cupsPerYear: 4 } }
    expect(parseCorrections(JSON.stringify(c))).toEqual(c)
  })

  it('rejects foreign or broken files', () => {
    expect(() => parseCorrections('nope')).toThrow('kein gültiges JSON')
    expect(() => parseCorrections('{"foo":1}')).toThrow('keine BEO-Cup')
    expect(() => parseCorrections('{"format":"beocup-corrections","version":1,"merges":[1],"separations":[],"overrides":{}}')).toThrow('beschädigt')
  })
})
