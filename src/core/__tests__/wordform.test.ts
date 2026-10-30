import { describe, expect, it } from 'vitest'
import { docText, parseEntryTime, parseWordForm, prepareSwimmers, readWordText } from '../wordform'
import { buildEntryLenex, lenexTime, zipLenex } from '../lenexWriter'
import { loadLenexFile, parseLenexFile } from '../lenex'
import { buildPersons } from '../matching'
import type { MeetTemplate } from '../types'
import { FOUR, corrections, cup, lenexXml, wordDoc, wordDocx } from './fixtures'

const DATE = '2026-10-31'

/** a form as Gstaad writes it: title, header, swimmer lines with typical quirks, relays */
const FORM = [
  'Anmeldung BeO – Cup aus Saanen',
  '\t\tDe\tRü\tBr\tCr',
  'Zaugglin Fiorella\t13\t37.15\t41.22\t44.81\t32.47',
  'Brändlimann Elio\t12\t---\t1:12.0\t1:21.0\t1:04.0',
  'De Vriesli Tamsin\t16\tx\t49.0\t56.0\t\t42.37',
  'Wyssmüller Ilvy\t14\t  \t52.83\t57.14\t43.62\t',
  'Kehrlimann Juri\t15\t43.27j\t47.0\t51:00\t38',
  'Staffeln:',
  'Team1:\tVierlagen: 2:40.0\tFreistil: 2:15.0',
].join('\r')

function announcement(): MeetTemplate {
  const file = parseLenexFile(lenexXml('Gstaad', DATE, []), 'Ausschreibung Gstaad.lxf')
  if (file.kind !== 'announcement') throw new Error('fixture is no announcement')
  return file.meet
}

describe('REQ 9.5 – reading Word entry forms', () => {
  it('reads the text of a Word 97 .doc (8-bit and UTF-16 pieces)', async () => {
    expect(docText(wordDoc(FORM))).toBe(FORM)
    expect(await readWordText(wordDoc(FORM))).toBe(FORM)
  })

  it('reads a .docx', async () => {
    const text = await readWordText(await wordDocx(FORM.split('\r')))
    expect(parseWordForm(text).rows).toHaveLength(5)
  })

  it('rejects other files', () => {
    expect(() => docText(new TextEncoder().encode('kein Word'))).toThrow(/Word/)
  })

  it('reads one row per swimmer, ignoring title, header and relays', () => {
    const form = parseWordForm(FORM)
    expect(form.title).toBe('Anmeldung BeO – Cup aus Saanen')
    expect(form.rows.map((r) => [r.name, r.birthYear])).toEqual([
      ['Zaugglin Fiorella', 2013],
      ['Brändlimann Elio', 2012],
      ['De Vriesli Tamsin', 2016],
      ['Wyssmüller Ilvy', 2014],
      ['Kehrlimann Juri', 2015],
    ])
  })

  it('reads the four strokes in the order Delfin, Rücken, Brust, Crawl', () => {
    const [first] = parseWordForm(FORM).rows
    expect(first.times).toEqual({ FLY: 3715, BACK: 4122, BREAST: 4481, FREE: 3247 })
  })

  it('treats ---, x and empty cells as not entered', () => {
    const rows = parseWordForm(FORM).rows
    expect(rows[1].times).toEqual({ BACK: 7200, BREAST: 8100, FREE: 6400 })
    expect(rows[3].times).toEqual({ BACK: 5283, BREAST: 5714, FREE: 4362 })
    expect([rows[0], rows[1], rows[3]].every((r) => r.errors.length === 0 && r.questions.length === 0)).toBe(true)
  })

  it('drops a stray empty cell but asks to check the strokes', () => {
    const row = parseWordForm(FORM).rows[2]
    expect(row.times).toEqual({ BACK: 4900, BREAST: 5600, FREE: 4237 })
    expect(row.questions).toEqual([expect.stringContaining('Zuordnung der Zeiten')])
  })

  it('reads typos only as a question to confirm', () => {
    const row = parseWordForm(FORM).rows[4]
    expect(row.times).toEqual({ FLY: 4327, BACK: 4700, BREAST: 5100, FREE: 3800 })
    expect(row.questions).toEqual(['«43.27j» gelesen als 43.27', '«51:00» gelesen als 51.00'])
    expect(row.errors).toEqual([])
  })

  it('keeps a line with a missing or unreadable year as an error instead of dropping it', () => {
    const form = parseWordForm(['Zaugglin Fiorella\t\t37.15\t41.22\t44.81\t32.47', 'Brändlimann Elio\tO9\t38.00\t41.00\t45.00\t33.00', 'Kehrlimann Juri\t37.15\t41.22\t44.81\t32.47'].join('\r'))
    expect(form.rows.map((r) => [r.birthYear, r.errors])).toEqual([
      [0, ['Jahrgang fehlt']],
      [0, ['Jahrgang «O9» nicht lesbar']],
      [0, ['Jahrgang fehlt']],
    ])
    expect(form.rows[2].times).toEqual({ FLY: 3715, BACK: 4122, BREAST: 4481, FREE: 3247 })
  })

  it('reports more than 4 times as an error', () => {
    const [row] = parseWordForm('Zaugglin Fiorella\t13\t37.15\t41.22\t44.81\t32.47\t35.00').rows
    expect(row.errors).toEqual([expect.stringContaining('5 Zeiten')])
  })

  it('lists the lines it did not take over', () => {
    expect(parseWordForm(FORM).ignored).toEqual([
      'Anmeldung BeO – Cup aus Saanen',
      'De  Rü  Br  Cr',
      'Staffeln:',
      'Team1:  Vierlagen: 2:40.0  Freistil: 2:15.0',
    ])
  })

  it('reports unreadable times as errors', () => {
    expect(parseEntryTime('3a')).toMatchObject({ time: null, error: expect.stringContaining('nicht lesbar') })
    expect(parseEntryTime('1:62.0').error).toBeDefined()
    expect(parseEntryTime('1:03.4')).toEqual({ time: 6340 })
    expect(parseEntryTime('45,5')).toMatchObject({ time: 4550 })
  })
})

describe('REQ 9.6 – preparing the swimmers', () => {
  const results = cup('Thun', '2026-08-22', [
    { id: '1', first: 'Fiorella', last: 'Zaugglin', birthdate: '2013-02-14', gender: 'F', club: 'SAAN', results: FOUR },
    { id: '2', first: 'Tamsin', last: 'De Vriesli', birthdate: '2016-01-01', gender: 'M', club: 'SAAN', results: FOUR },
    { id: '3', first: 'Ilvy', last: 'Wyssmüller', birthdate: '2013-05-20', gender: 'F', club: 'SAAN', results: FOUR },
  ])
  const swimmers = prepareSwimmers(parseWordForm(FORM).rows, buildPersons([results], corrections()))

  it('takes gender and real birthdate from the results', () => {
    expect(swimmers[0]).toMatchObject({ lastname: 'Zaugglin', firstname: 'Fiorella', gender: 'F', birthdate: '2013-02-14', known: true, questions: [], errors: [], info: [] })
  })

  it('finds a two-word last name in the results', () => {
    expect(swimmers[2]).toMatchObject({ lastname: 'De Vriesli', firstname: 'Tamsin', gender: 'M', birthdate: '2016-01-01' })
  })

  it('leaves the gender of an unknown swimmer open', () => {
    expect(swimmers[1]).toMatchObject({ lastname: 'Brändlimann', firstname: 'Elio', gender: '', known: false, birthdate: '2012-01-01', questions: [] })
    expect(swimmers[1].info).toEqual(['Nicht in den Vergleichs-Resultaten'])
  })

  it('asks about a birth year that differs from the results and does not take the gender over', () => {
    expect(swimmers[3]).toMatchObject({ gender: '', birthYear: 2014, birthdate: '2014-01-01' })
    expect(swimmers[3].questions).toEqual(['In den Resultaten mit Jahrgang 2013, F: Jahrgang prüfen'])
  })

  it('asks how to split an unknown name of three words', () => {
    const [s3] = prepareSwimmers(parseWordForm('Zaugglin Fiorella Ilvy\t13\t37.15\t41.22\t44.81\t32.47').rows, [])
    expect(s3).toMatchObject({ lastname: 'Zaugglin Fiorella', firstname: 'Ilvy', gender: '' })
    expect(s3.questions).toEqual([expect.stringContaining('Aufteilung')])
  })

  it('a name of one word and a missing year are errors, not guesses', () => {
    const [one, noYear] = prepareSwimmers(parseWordForm('Zaugglin\t13\t37.15\t41.22\t44.81\t32.47\rBrändlimann Elio\t\t37.15\t41.22\t44.81\t32.47').rows, [])
    expect(one.errors).toEqual(['Nachname oder Vorname fehlt'])
    expect(noYear).toMatchObject({ birthYear: 0, birthdate: '', errors: ['Jahrgang fehlt'] })
  })

  it('does not take a gender over when the results know the name with both genders', () => {
    const both = cup('Spiez', '2026-06-06', [{ id: '9', first: 'Fiorella', last: 'Zaugglin', birthdate: '2013-03-01', gender: 'M', club: 'SAAN', results: FOUR }])
    const [s0] = prepareSwimmers(parseWordForm(FORM).rows, buildPersons([results, both], corrections()))
    expect(s0.gender).toBe('')
    expect(s0.info).toContain('In den Resultaten mit beiden Geschlechtern')
  })
})

describe('REQ 9.7 – writing the LENEX entry file', () => {
  const meet = announcement()
  const swimmers = [
    { lastname: 'Zaugglin', firstname: 'Fiorella', birthdate: '2013-02-14', gender: 'F' as const, times: { FLY: 3715, BACK: 4122, BREAST: 4481, FREE: 3247 } },
    { lastname: 'Brändlimann & Co', firstname: 'Elio "E"', birthdate: '2012-01-01', gender: 'M' as const, times: { BACK: 7200, BREAST: 8100, FREE: 6400 } },
  ]
  const xml = buildEntryLenex(meet, { code: 'SAAN', name: 'Schulsport Saanenland' }, swimmers, '2026-10-30T12:00:00')

  it('reads an announcement as meet template with all its events', () => {
    expect(meet).toMatchObject({ id: '2026-10-31-gstaad', city: 'Gstaad', date: DATE })
    expect(meet.events).toHaveLength(10)
    expect(meet.events[0]).toMatchObject({ eventid: '1', number: '1', gender: 'M', distance: '50', relaycount: '1', stroke: 'FLY' })
  })

  it('formats entry times', () => {
    expect(lenexTime(3715)).toBe('00:00:37.15')
    expect(lenexTime(7200)).toBe('00:01:12.00')
  })

  it('produces an entry file the app reads back unchanged', async () => {
    const file = await loadLenexFile(await zipLenex(xml, 'Meldung SAAN'), 'Meldung SAAN.lxf')
    expect(file.kind).toBe('entries')
    if (file.kind !== 'entries') return
    expect(file.entries).toMatchObject({ meetId: '2026-10-31-gstaad', created: '2026-10-30T12:00:00' })
    expect(file.entries.swimmers.map((s) => [s.lastname, s.firstname, s.gender, s.birthdate, s.clubCode, s.strokes, s.wrongGender])).toEqual([
      ['Zaugglin', 'Fiorella', 'F', '2013-02-14', 'SAAN', ['FLY', 'BACK', 'BREAST', 'FREE'], []],
      ['Brändlimann & Co', 'Elio "E"', 'M', '2012-01-01', 'SAAN', ['BACK', 'BREAST', 'FREE'], []],
    ])
  })

  it('uses the event ids of the announcement and the entry times of the form', () => {
    // girls' Fly is event 2, boys' Back event 3 in the fixture announcement
    expect(xml).toContain('<ENTRY eventid="2" entrytime="00:00:37.15" />')
    expect(xml).toContain('<ENTRY eventid="3" entrytime="00:01:12.00" />')
    // all events of the announcement are listed, relays included
    expect(xml).toMatch(/<EVENT eventid="9"[^>]*gender="X"/)
  })

  it('fails when the announcement lacks an event', () => {
    const partial = { ...meet, events: meet.events.filter((e) => e.stroke !== 'FLY') }
    expect(() => buildEntryLenex(partial, { code: 'SAAN', name: 'S' }, swimmers, '')).toThrow(/keinen Wettkampf/)
  })
})
