import { describe, expect, it } from 'vitest'
import { loadCupFile, loadLenexFile, parseLenexFile } from '../lenex'
import { activeEntries, checkEntries, strokeFindings } from '../entries'
import { buildPersons } from '../matching'
import { categoryForAge } from '../scoring'
import { setOverride } from '../corrections'
import type { Cup, EntryFile } from '../types'
import { FOUR, corrections, cup, entryFile, entryXml, lenexXml, zipped, type FixtureEntry } from './fixtures'

const MELDUNG_DATE = '2026-10-31'
const ALL4 = ['FLY', 'BACK', 'BREAST', 'FREE'] as const
const DREI = ['BACK', 'BREAST', 'FREE'] as const

function swimmer(over: Partial<FixtureEntry> = {}): FixtureEntry {
  return { id: '1', first: 'Fiorella', last: 'Zaugglin', birthdate: '2013-02-14', gender: 'F', club: 'SCFR', strokes: [...ALL4], ...over }
}

/** checks of one entry file against the given comparison cups */
function check(entries: FixtureEntry[], cups: Cup[] = [], c = corrections()) {
  const files = [entryFile('Gstaad', MELDUNG_DATE, entries)]
  return checkEntries(files, cups, buildPersons(cups, c))[0].checks
}

const types = (checks: ReturnType<typeof check>, i = 0) => checks[i].findings.map((f) => `${f.severity}:${f.type}`)

describe('REQ 9.1 – entry files', () => {
  it('recognises entry, result and announcement files', async () => {
    const entries = await loadLenexFile(await zipped(entryXml('Gstaad', MELDUNG_DATE, [swimmer()])), 'meldung.lxf')
    expect(entries.kind).toBe('entries')
    const results = parseLenexFile(lenexXml('Thun', '2026-08-22', [{ id: '1', first: 'Fiorella', last: 'Zaugglin', birthdate: '2013-02-14', gender: 'F', results: FOUR }]), 'r.lxf')
    expect(results.kind).toBe('results')
    expect(parseLenexFile(lenexXml('Gstaad', MELDUNG_DATE, []), 'ausschreibung.lxf').kind).toBe('announcement')
  })

  it('reads the entered 50m strokes, other events and the creation time', () => {
    const f = entryFile('Gstaad', MELDUNG_DATE, [swimmer({ strokes: ['FREE', 'BACK'], hundred: true })], '2026-10-23T18:32:47')
    expect(f).toMatchObject({ meetId: '2026-10-31-gstaad', year: 2026, created: '2026-10-23T18:32:47' })
    expect(f.swimmers[0]).toMatchObject({ strokes: ['BACK', 'FREE'], otherEvents: 1, wrongGender: [], birthYear: 2013, clubCode: 'SCFR' })
  })

  it('uses the fallback creation time when the file has none', () => {
    const file = parseLenexFile(entryXml('Gstaad', MELDUNG_DATE, [swimmer()]), 'm.lxf', '2026-10-20T10:00:00')
    expect(file.kind === 'entries' && file.entries.created).toBe('2026-10-20T10:00:00')
  })

  it('does not load entry or announcement files as a cup', async () => {
    await expect(loadCupFile(new TextEncoder().encode(entryXml('Gstaad', MELDUNG_DATE, [swimmer()])), 'm.lef')).rejects.toThrow(/Meldedatei/)
    await expect(loadCupFile(new TextEncoder().encode(lenexXml('Gstaad', MELDUNG_DATE, [])), 'a.lef')).rejects.toThrow(/keine Resultate/)
  })
})

describe('REQ 9.2 – disciplines per category', () => {
  const findings = (over: Partial<FixtureEntry>) => {
    const s = entryFile('Gstaad', MELDUNG_DATE, [swimmer(over)]).swimmers[0]
    return strokeFindings(s, categoryForAge(2026 - s.birthYear))
  }

  it('derives the category from the year of the cup', () => {
    expect(check([swimmer({ birthdate: '2015-06-01' })])[0].category).toBe('IV')
    expect(check([swimmer({ birthdate: '2013-06-01' })])[0].category).toBe('III')
    expect(check([swimmer({ birthdate: '2017-06-01' })])[0].category).toBe('V')
  })

  it('Kat. V/IV: Back, Breast and Free are enough, Fly is optional', () => {
    expect(findings({ birthdate: '2016-03-09', strokes: [...DREI] })).toEqual([])
    expect(findings({ birthdate: '2016-03-09', strokes: [...ALL4] })).toEqual([])
  })

  it('Kat. V/IV: fewer than 3 strokes is an error naming the missing ones', () => {
    const f = findings({ birthdate: '2016-03-09', strokes: ['BACK', 'FREE'] })
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ type: 'strokes', severity: 'error' })
    expect(f[0].text).toContain('Brust')
  })

  it('Kat. V/IV: Fly instead of a required stroke is a warning', () => {
    const f = findings({ birthdate: '2016-03-09', strokes: ['FLY', 'BACK', 'FREE'] })
    expect(f).toEqual([expect.objectContaining({ type: 'fly', severity: 'warning' })])
    expect(f[0].text).toContain('Brust')
  })

  it('Kat. III–I: all 4 strokes, otherwise an error naming the missing ones', () => {
    expect(findings({ strokes: [...ALL4] })).toEqual([])
    const f = findings({ strokes: [...DREI] })
    expect(f).toEqual([expect.objectContaining({ type: 'strokes', severity: 'error' })])
    expect(f[0].text).toContain('Delfin')
  })

  it('only other events (100m) is a warning, nothing at all an error', () => {
    expect(findings({ strokes: [], hundred: true })).toEqual([expect.objectContaining({ type: 'strokes', severity: 'warning' })])
    // an athlete without any entry: SPLASH writes an empty ENTRIES element
    const s = { ...entryFile('Gstaad', MELDUNG_DATE, [swimmer()]).swimmers[0], strokes: [] }
    expect(strokeFindings(s, 'III')).toEqual([expect.objectContaining({ type: 'strokes', severity: 'error' })])
  })

  it('an entry in the other gender’s event is an error', () => {
    expect(findings({ wrongGender: ['BACK'] })).toEqual([expect.objectContaining({ type: 'eventGender', severity: 'error' })])
  })
})

describe('REQ 9.3 – cross-check against comparison results', () => {
  const past = (over: Partial<{ first: string; last: string; birthdate: string; gender: 'F' | 'M'; club: string }> = {}, city = 'Thun', date = '2025-08-30') =>
    cup(city, date, [{ id: '7', first: 'Fiorella', last: 'Zaugglin', birthdate: '2013-02-14', gender: 'F', club: 'SCFR', results: FOUR, ...over }])

  it('a known swimmer with the same data has no findings', () => {
    const [c] = check([swimmer()], [past()])
    expect(c.match).toBeDefined()
    expect(c.findings).toEqual([])
  })

  it('a different birth year is an error naming the year and the cup', () => {
    const checks = check([swimmer({ birthdate: '2012-02-14' })], [past()])
    expect(types(checks)).toEqual(['error:birthyear'])
    expect(checks[0].findings[0].text).toContain('Jahrgang 2013')
    expect(checks[0].findings[0].text).toContain('Thun 30.08.2025')
  })

  it('a different gender is an error', () => {
    expect(types(check([swimmer({ gender: 'M' })], [past()]))).toEqual(['error:gender'])
  })

  it('compares with results of any year and uses the most recent cup in the message', () => {
    const checks = check([swimmer({ birthdate: '2012-02-14' })], [past({}, 'Spiez', '2024-06-08'), past({}, 'Gstaad', '2025-09-25')])
    expect(checks[0].findings[0].text).toContain('Gstaad 25.09.2025')
  })

  it('a known swimmer with other data in some results gets a warning', () => {
    const cups = [past(), past({ birthdate: '2012-02-14' }, 'Spiez', '2025-06-28')]
    expect(types(check([swimmer()], cups))).toEqual(['warning:birthyear'])
  })

  it('a different exact birthdate is a warning', () => {
    expect(types(check([swimmer({ birthdate: '2013-02-27' })], [past()]))).toEqual(['warning:birthdate'])
  })

  it('a placeholder birthdate is no birthdate difference', () => {
    expect(types(check([swimmer({ birthdate: '2013-01-01' })], [past()]))).toEqual(['info:placeholder'])
  })

  it('similar and swapped names are warnings with the person found', () => {
    const similar = check([swimmer({ last: 'Zauglin' })], [past()])
    expect(types(similar)).toEqual(['warning:similar'])
    expect(similar[0].findings[0].text).toContain('Zaugglin Fiorella')
    const swapped = check([swimmer({ first: 'Zaugglin', last: 'Fiorella' })], [past()])
    expect(swapped[0].findings[0].text).toContain('vertauscht')
  })

  it('an unknown swimmer is reported as new (info)', () => {
    expect(types(check([swimmer({ first: 'Tamsin', last: 'Pfisterli' })], [past()]))).toEqual(['info:new'])
  })

  it('applies the operator’s corrections to the comparison results', () => {
    const results = past({ birthdate: '2012-02-14' })
    const fixed = setOverride(corrections(), results.entries[0].key, { birthYear: 2013 })
    expect(types(check([swimmer()], [results]))).toEqual(['error:birthyear'])
    expect(types(check([swimmer()], [results], fixed))).toEqual([])
  })

  it('without comparison results only the disciplines are checked', () => {
    expect(types(check([swimmer({ strokes: [...DREI] })]))).toEqual(['error:strokes', 'info:new'])
  })
})

describe('REQ 9.4 – several files per cup', () => {
  const a = swimmer()
  const b = swimmer({ id: '2', first: 'Elio', last: 'Brändlimann', birthdate: '2012-09-03', gender: 'M' })

  it('the newest file of a club replaces its older one', () => {
    const old = entryFile('Gstaad', MELDUNG_DATE, [a], '2026-10-19T19:49:54', 'v1.lxf')
    const neu = entryFile('Gstaad', MELDUNG_DATE, [a, b], '2026-10-23T08:00:00', 'v2.lxf')
    for (const files of [[old, neu], [neu, old]]) {
      const { swimmers, replaced } = activeEntries(files)
      expect(swimmers.map((s) => s.file.fileName)).toEqual(['v2.lxf', 'v2.lxf'])
      expect(replaced).toEqual([expect.objectContaining({ file: old, by: neu, club: 'Schwimmclub Frutigen' })])
    }
  })

  it('treats the codes of one club as the same club', () => {
    const old = entryFile('Gstaad', MELDUNG_DATE, [{ ...a, club: 'INT' }], '2026-10-01T00:00:00', 'v1.lxf')
    const neu = entryFile('Gstaad', MELDUNG_DATE, [{ ...a, club: 'INTA' }], '2026-10-02T00:00:00', 'v2.lxf')
    expect(activeEntries([old, neu]).replaced).toHaveLength(1)
  })

  it('keeps the files of other clubs and other cups', () => {
    const files: EntryFile[] = [
      entryFile('Gstaad', MELDUNG_DATE, [a], '2026-10-01T00:00:00', 'scfr.lxf'),
      entryFile('Gstaad', MELDUNG_DATE, [{ ...b, club: 'UET' }], '2026-10-05T00:00:00', 'uet.lxf'),
      entryFile('Thun', '2026-08-22', [a], '2026-08-10T00:00:00', 'thun.lxf'),
    ]
    const { swimmers, replaced } = activeEntries(files)
    expect(swimmers).toHaveLength(3)
    expect(replaced).toEqual([])
    expect(checkEntries(files, [], [])).toHaveLength(2)
  })

  it('without creation times the file loaded last wins', () => {
    const first = entryFile('Gstaad', MELDUNG_DATE, [a], '', 'erste.lxf')
    const second = entryFile('Gstaad', MELDUNG_DATE, [a, b], '', 'zweite.lxf')
    expect(activeEntries([first, second]).replaced[0].by).toBe(second)
  })

  it('a swimmer entered by two clubs is a warning', () => {
    const files = [
      entryFile('Gstaad', MELDUNG_DATE, [a], '', 'scfr.lxf'),
      entryFile('Gstaad', MELDUNG_DATE, [{ ...a, club: 'UET' }], '', 'uet.lxf'),
    ]
    const checks = checkEntries(files, [], [])[0].checks
    expect(checks.every((c) => c.findings.some((f) => f.type === 'duplicate' && f.severity === 'warning'))).toBe(true)
  })

  it('an unknown club is reported as info', () => {
    expect(types(check([swimmer({ club: 'XYZ' })]))).toContain('info:club')
  })
})
