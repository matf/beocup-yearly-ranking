import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { Cup, Entry, EntryFile, EntrySwimmer, Gender, MeetEvent, MeetTemplate, Stroke, SwimResult } from './types'
import { STROKES } from './types'

const ARRAY_TAGS = new Set([
  'MEET', 'SESSION', 'EVENT', 'CLUB', 'ATHLETE', 'RESULT', 'AGEGROUP', 'RANKING', 'RELAY', 'HEAT', 'ENTRY',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  isArray: (name) => ARRAY_TAGS.has(name),
})

/** Parses "HH:MM:SS.hh" into hundredths of a second; 0 for missing or invalid values. */
export function parseSwimTime(value: string | undefined): number {
  const m = /^(\d+):(\d+):(\d+)\.(\d+)$/.exec(value ?? '')
  if (!m) return 0
  const hundredths = Number(m[4].padEnd(2, '0').slice(0, 2))
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 100 + hundredths
}

export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Reads an .lxf (zip) or plain .lef/.xml file and returns the LENEX XML text. */
export async function readLenexXml(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (!isZip) return new TextDecoder('utf-8').decode(bytes)
  const zip = await JSZip.loadAsync(bytes)
  const file = Object.values(zip.files).find((f) => !f.dir && /\.(lef|xml)$/i.test(f.name))
  if (!file) throw new Error('Die Datei enthält keine LENEX-Datei (.lef).')
  return file.async('string')
}

/** parsed XML node – LENEX is loosely typed, values are validated where used */
type Node = any

/**
 * What a LENEX file holds. SPLASH writes the same format for the announcement (Ausschreibung:
 * no athletes), the clubs' entries (Meldungen: ENTRY elements) and the results (RESULT elements).
 */
export type LenexFile =
  | { kind: 'results'; cup: Cup }
  | { kind: 'entries'; entries: EntryFile }
  | { kind: 'announcement'; meet: MeetTemplate }

interface Meet {
  node: Node
  id: string
  name: string
  city: string
  date: string
  /** individual 50m events: eventid → stroke and event gender */
  events: Map<string, { stroke: Stroke; gender: string }>
  /** all events, for the announcement template */
  allEvents: MeetEvent[]
}

function readMeet(doc: Node): Meet {
  const meet: Node = doc?.LENEX?.MEETS?.MEET?.[0]
  if (!meet) throw new Error('Keine Veranstaltung (MEET) in der Datei gefunden.')

  const sessions: Node[] = meet.SESSIONS?.SESSION ?? []
  const date: string = sessions[0]?.date ?? meet.AGEDATE?.value ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Datum der Veranstaltung fehlt.')
  const city: string = meet.city ?? ''

  const events = new Map<string, { stroke: Stroke; gender: string }>()
  const allEvents: MeetEvent[] = []
  for (const session of sessions) {
    for (const event of session.EVENTS?.EVENT ?? []) {
      const style = event.SWIMSTYLE
      allEvents.push({
        eventid: String(event.eventid ?? ''),
        number: String(event.number ?? ''),
        gender: String(event.gender ?? ''),
        distance: String(style?.distance ?? ''),
        relaycount: String(style?.relaycount ?? ''),
        stroke: String(style?.stroke ?? ''),
      })
      if (style?.distance === '50' && style?.relaycount === '1' && STROKES.includes(style.stroke)) {
        events.set(event.eventid, { stroke: style.stroke, gender: event.gender ?? '' })
      }
    }
  }
  return { node: meet, id: `${date}-${slug(city)}`, name: String(meet.name ?? ''), city, date, events, allEvents }
}

function athletes(meet: Meet): { club: Node; athlete: Node }[] {
  return (meet.node.CLUBS?.CLUB ?? []).flatMap((club: Node) =>
    (club.ATHLETES?.ATHLETE ?? []).map((athlete: Node) => ({ club, athlete })),
  )
}

function person(club: Node, athlete: Node) {
  const birthdate: string = athlete.birthdate ?? ''
  return {
    athleteId: String(athlete.athleteid),
    firstname: String(athlete.firstname ?? '').trim(),
    lastname: String(athlete.lastname ?? '').trim(),
    birthdate,
    birthYear: Number(birthdate.slice(0, 4)) || 0,
    gender: (athlete.gender === 'F' ? 'F' : 'M') as Gender,
    clubCode: String(club.code ?? ''),
    clubName: String(club.name ?? club.shortname ?? ''),
  }
}

function resultsCup(meet: Meet, fileName: string): Cup {
  const entries: Entry[] = athletes(meet).map(({ club, athlete }) => {
    const results: Partial<Record<Stroke, SwimResult>> = {}
    for (const result of athlete.RESULTS?.RESULT ?? []) {
      const event = meet.events.get(result.eventid)
      if (event) results[event.stroke] = { time: parseSwimTime(result.swimtime), status: result.status ?? '' }
    }
    const p = person(club, athlete)
    return { key: `${meet.id}:${p.athleteId}`, cupId: meet.id, ...p, results }
  })
  return { id: meet.id, name: meet.name, city: meet.city, date: meet.date, year: Number(meet.date.slice(0, 4)), fileName, entries }
}

function entryFile(meet: Meet, fileName: string, created: string): EntryFile {
  const swimmers: EntrySwimmer[] = athletes(meet).map(({ club, athlete }) => {
    const strokes = new Set<Stroke>()
    const wrongGender = new Set<Stroke>()
    let otherEvents = 0
    const p = person(club, athlete)
    for (const entry of athlete.ENTRIES?.ENTRY ?? []) {
      const event = meet.events.get(entry.eventid)
      if (!event) {
        otherEvents++
        continue
      }
      strokes.add(event.stroke)
      if (event.gender && event.gender !== p.gender) wrongGender.add(event.stroke)
    }
    const order = (list: Set<Stroke>) => STROKES.filter((s) => list.has(s))
    return { ...p, strokes: order(strokes), wrongGender: order(wrongGender), otherEvents }
  })
  return {
    id: `${meet.id}:${fileName}`,
    meetId: meet.id,
    meetName: meet.name,
    city: meet.city,
    date: meet.date,
    year: Number(meet.date.slice(0, 4)),
    created,
    fileName,
    swimmers,
  }
}

/**
 * Parses any BEO-Cup LENEX file. `fallbackCreated` (ISO date) is used when the file has no
 * `created` attribute, e.g. the file's modification time.
 */
export function parseLenexFile(xml: string, fileName: string, fallbackCreated = ''): LenexFile {
  const doc = parser.parse(xml)
  const meet = readMeet(doc)
  const list = athletes(meet)
  if (list.some(({ athlete }) => athlete.RESULTS?.RESULT?.length)) return { kind: 'results', cup: resultsCup(meet, fileName) }
  if (list.some(({ athlete }) => athlete.ENTRIES?.ENTRY?.length)) {
    const created = String(doc.LENEX.created ?? '') || fallbackCreated
    return { kind: 'entries', entries: entryFile(meet, fileName, created) }
  }
  return {
    kind: 'announcement',
    meet: { id: meet.id, name: meet.name, city: meet.city, date: meet.date, fileName, events: meet.allEvents },
  }
}

export async function loadLenexFile(data: ArrayBuffer | Uint8Array, fileName: string, fallbackCreated = ''): Promise<LenexFile> {
  return parseLenexFile(await readLenexXml(data), fileName, fallbackCreated)
}

/** A result file; entry and announcement files are rejected with a German message. */
export function parseLenex(xml: string, fileName: string): Cup {
  const file = parseLenexFile(xml, fileName)
  if (file.kind === 'entries') throw new Error('Das ist eine Meldedatei (keine Resultate). Meldungen im Tab «Meldungen» laden.')
  if (file.kind === 'announcement') throw new Error('Die Datei enthält keine Resultate (Ausschreibung?).')
  return file.cup
}

export async function loadCupFile(data: ArrayBuffer | Uint8Array, fileName: string): Promise<Cup> {
  return parseLenex(await readLenexXml(data), fileName)
}
