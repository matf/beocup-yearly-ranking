import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { Cup, Entry, Gender, Stroke, SwimResult } from './types'
import { STROKES } from './types'

const ARRAY_TAGS = new Set([
  'MEET', 'SESSION', 'EVENT', 'CLUB', 'ATHLETE', 'RESULT', 'AGEGROUP', 'RANKING', 'RELAY', 'HEAT',
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

export function parseLenex(xml: string, fileName: string): Cup {
  const doc = parser.parse(xml)
  const meet: Node = doc?.LENEX?.MEETS?.MEET?.[0]
  if (!meet) throw new Error('Keine Veranstaltung (MEET) in der Datei gefunden.')

  const sessions: Node[] = meet.SESSIONS?.SESSION ?? []
  const date: string = sessions[0]?.date ?? meet.AGEDATE?.value ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Datum der Veranstaltung fehlt.')
  const city: string = meet.city ?? ''

  // map eventid -> stroke for the individual 50m events
  const strokeByEvent = new Map<string, Stroke>()
  for (const session of sessions) {
    for (const event of session.EVENTS?.EVENT ?? []) {
      const style = event.SWIMSTYLE
      if (style?.distance === '50' && style?.relaycount === '1' && STROKES.includes(style.stroke)) {
        strokeByEvent.set(event.eventid, style.stroke)
      }
    }
  }

  const id = `${date}-${slug(city)}`
  const entries: Entry[] = []
  for (const club of meet.CLUBS?.CLUB ?? []) {
    for (const athlete of club.ATHLETES?.ATHLETE ?? []) {
      const results: Partial<Record<Stroke, SwimResult>> = {}
      for (const result of athlete.RESULTS?.RESULT ?? []) {
        const stroke = strokeByEvent.get(result.eventid)
        if (stroke) results[stroke] = { time: parseSwimTime(result.swimtime), status: result.status ?? '' }
      }
      const birthdate: string = athlete.birthdate ?? ''
      entries.push({
        key: `${id}:${athlete.athleteid}`,
        cupId: id,
        athleteId: String(athlete.athleteid),
        firstname: String(athlete.firstname ?? '').trim(),
        lastname: String(athlete.lastname ?? '').trim(),
        birthdate,
        birthYear: Number(birthdate.slice(0, 4)) || 0,
        gender: (athlete.gender === 'F' ? 'F' : 'M') as Gender,
        clubCode: String(club.code ?? ''),
        clubName: String(club.name ?? club.shortname ?? ''),
        results,
      })
    }
  }

  return {
    id,
    name: String(meet.name ?? ''),
    city,
    date,
    year: Number(date.slice(0, 4)),
    fileName,
    entries,
  }
}

export async function loadCupFile(data: ArrayBuffer | Uint8Array, fileName: string): Promise<Cup> {
  return parseLenex(await readLenexXml(data), fileName)
}
