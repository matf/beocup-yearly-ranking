import CFB from 'cfb'
import JSZip from 'jszip'
import type { Cup, EntryFile, Gender, Stroke } from '../types'
import { parseLenex, parseLenexFile } from '../lenex'
import { emptyCorrections } from '../corrections'

export interface FixtureAthlete {
  id: string
  first: string
  last: string
  birthdate: string
  gender: Gender
  club?: string
  /** stroke → "SS.hh" time, or [time, status] */
  results?: Partial<Record<Stroke, string | [string, string]>>
}

const EVENT_IDS: Record<Stroke, Record<Gender, number>> = {
  FLY: { M: 1, F: 2 },
  BACK: { M: 3, F: 4 },
  BREAST: { M: 5, F: 6 },
  FREE: { M: 7, F: 8 },
}

function toLenexTime(t: string): string {
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    return `00:${m.padStart(2, '0')}:${s.padStart(5, '0')}`
  }
  return `00:00:${t.padStart(5, '0')}`
}

function eventsXml(): string[] {
  const events = Object.entries(EVENT_IDS).flatMap(([stroke, ids]) =>
    Object.entries(ids).map(
      ([gender, id]) =>
        `<EVENT eventid="${id}" gender="${gender}" number="${id}"><SWIMSTYLE distance="50" relaycount="1" stroke="${stroke}" /></EVENT>`,
    ),
  )
  // events that must be ignored: relay and 100m freestyle
  events.push('<EVENT eventid="9" gender="X"><SWIMSTYLE distance="50" relaycount="4" stroke="FREE" /></EVENT>')
  events.push('<EVENT eventid="11"><SWIMSTYLE distance="100" relaycount="1" stroke="FREE" /></EVENT>')
  return events
}

function meetXml(city: string, date: string, clubs: string[], created = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<LENEX version="3.0"${created ? ` created="${created}"` : ''}><MEETS><MEET city="${city}" name="BEO-Cup ${city}">
<AGEDATE value="${date}" type="YEAR" />
<SESSIONS><SESSION date="${date}" number="1"><EVENTS>${eventsXml().join('')}</EVENTS></SESSION></SESSIONS>
<CLUBS>${clubs.join('')}</CLUBS>
</MEET></MEETS></LENEX>`
}

function byClub<T extends { club?: string }>(athletes: T[]): Map<string, T[]> {
  const clubs = new Map<string, T[]>()
  for (const a of athletes) clubs.set(a.club ?? 'SCX', [...(clubs.get(a.club ?? 'SCX') ?? []), a])
  return clubs
}

/** Builds a minimal LENEX document shaped like a SPLASH Meet Manager BEO-Cup export. */
export function lenexXml(city: string, date: string, athletes: FixtureAthlete[]): string {
  const clubXml = [...byClub(athletes)].map(([code, list]) => {
    const aths = list.map((a) => {
      const results = Object.entries(a.results ?? {}).map(([stroke, v]) => {
        const [time, status] = Array.isArray(v) ? v : [v, '']
        return `<RESULT eventid="${EVENT_IDS[stroke as Stroke][a.gender]}" swimtime="${toLenexTime(time)}"${status ? ` status="${status}"` : ''} resultid="r${a.id}${stroke}" />`
      })
      results.push(`<RESULT eventid="11" swimtime="00:01:00.00" resultid="r${a.id}100" />`)
      return `<ATHLETE athleteid="${a.id}" firstname="${a.first}" lastname="${a.last}" birthdate="${a.birthdate}" gender="${a.gender}"><RESULTS>${results.join('')}</RESULTS></ATHLETE>`
    })
    return `<CLUB code="${code}" name="Club ${code}"><ATHLETES>${aths.join('')}</ATHLETES></CLUB>`
  })

  return meetXml(city, date, clubXml)
}

export interface FixtureEntry {
  id: string
  first: string
  last: string
  birthdate: string
  gender: Gender
  club?: string
  strokes: Stroke[]
  /** strokes entered in the other gender's event */
  wrongGender?: Stroke[]
  /** also entered for 100m freestyle */
  hundred?: boolean
}

/** Builds a club entry file shaped like a SPLASH Team Manager export (ENTRY instead of RESULT). */
export function entryXml(city: string, date: string, athletes: FixtureEntry[], created = ''): string {
  const other = (g: Gender): Gender => (g === 'F' ? 'M' : 'F')
  const clubXml = [...byClub(athletes)].map(([code, list]) => {
    const aths = list.map((a) => {
      const entries = a.strokes.map((s) => `<ENTRY eventid="${EVENT_IDS[s][a.wrongGender?.includes(s) ? other(a.gender) : a.gender]}" entrytime="00:00:00.00" />`)
      if (a.hundred) entries.push('<ENTRY eventid="11" entrytime="00:00:00.00" />')
      return `<ATHLETE athleteid="${a.id}" firstname="${a.first}" lastname="${a.last}" birthdate="${a.birthdate}" gender="${a.gender}"><ENTRIES>${entries.join('')}</ENTRIES></ATHLETE>`
    })
    return `<CLUB code="${code}" name="Club ${code}"><ATHLETES>${aths.join('')}</ATHLETES></CLUB>`
  })
  return meetXml(city, date, clubXml, created)
}

export function entryFile(city: string, date: string, athletes: FixtureEntry[], created = '', fileName = `${city}-meldung.lxf`): EntryFile {
  const file = parseLenexFile(entryXml(city, date, athletes, created), fileName)
  if (file.kind !== 'entries') throw new Error('fixture is no entry file')
  return file.entries
}

export function cup(city: string, date: string, athletes: FixtureAthlete[]): Cup {
  return parseLenex(lenexXml(city, date, athletes), `${city}.lxf`)
}

export async function zipped(xml: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('result.lef', xml)
  return zip.generateAsync({ type: 'uint8array' })
}

/** four valid 50m times */
export const FOUR = { FLY: '40.00', BACK: '41.00', BREAST: '42.00', FREE: '35.00' } as const

export function corrections() {
  return emptyCorrections()
}

/**
 * A minimal Word 97 .doc with the given text: a WordDocument stream (FIB + text) and a table
 * stream with the piece table. The first half is stored as 8-bit text, the rest as UTF-16,
 * as Word does after edits.
 */
export function wordDoc(text: string): Uint8Array {
  const split = Math.floor(text.length / 2)
  const cp1252 = (c: string) => (c === '–' ? 0x96 : c.charCodeAt(0))
  const first = Uint8Array.from([...text.slice(0, split)].map(cp1252))
  const second = new Uint8Array((text.length - split) * 2)
  for (let i = split; i < text.length; i++) new DataView(second.buffer).setUint16((i - split) * 2, text.charCodeAt(i), true)
  const at8 = 0x400
  const at16 = at8 + first.length + (first.length % 2)
  const word = new Uint8Array(at16 + second.length)
  const w = new DataView(word.buffer)
  w.setUint16(0, 0xa5ec, true)
  w.setUint16(0x0a, 0x0200, true) // text in 1Table
  w.setUint32(0x4c, text.length, true) // ccpText
  word.set(first, at8)
  word.set(second, at16)
  // CLX: one property modifier (skipped), then the piece table with two pieces
  const table = new Uint8Array(5 + 5 + 3 * 4 + 2 * 8)
  const t = new DataView(table.buffer)
  table[0] = 0x01
  t.setUint16(1, 2, true)
  table[5] = 0x02
  t.setUint32(6, 3 * 4 + 2 * 8, true)
  t.setUint32(10, 0, true)
  t.setUint32(14, split, true)
  t.setUint32(18, text.length, true)
  t.setUint32(22 + 2, (at8 * 2) | 0x40000000, true)
  t.setUint32(30 + 2, at16, true)
  w.setUint32(0x01a2, 0, true) // fcClx
  w.setUint32(0x01a6, table.length, true)
  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, 'WordDocument', word)
  CFB.utils.cfb_add(cfb, '1Table', table)
  return new Uint8Array(CFB.write(cfb, { type: 'array' }) as ArrayLike<number>)
}

/** A .docx with the given lines as paragraphs, tabs as <w:tab/>. */
export async function wordDocx(lines: string[]): Promise<Uint8Array> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const p = (l: string) => `<w:p><w:r>${l.split('\t').map((part) => `<w:t xml:space="preserve">${esc(part)}</w:t>`).join('<w:tab/>')}</w:r></w:p>`
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${lines.map(p).join('')}</w:body></w:document>`)
  return zip.generateAsync({ type: 'uint8array' })
}
