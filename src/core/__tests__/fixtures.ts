import JSZip from 'jszip'
import type { Cup, Gender, Stroke } from '../types'
import { parseLenex } from '../lenex'
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

/** Builds a minimal LENEX document shaped like a SPLASH Meet Manager BEO-Cup export. */
export function lenexXml(city: string, date: string, athletes: FixtureAthlete[]): string {
  const events = Object.entries(EVENT_IDS).flatMap(([stroke, ids]) =>
    Object.entries(ids).map(
      ([gender, id]) =>
        `<EVENT eventid="${id}" gender="${gender}" number="${id}"><SWIMSTYLE distance="50" relaycount="1" stroke="${stroke}" /></EVENT>`,
    ),
  )
  // events that must be ignored: relay and 100m freestyle
  events.push('<EVENT eventid="9" gender="X"><SWIMSTYLE distance="50" relaycount="4" stroke="FREE" /></EVENT>')
  events.push('<EVENT eventid="11"><SWIMSTYLE distance="100" relaycount="1" stroke="FREE" /></EVENT>')

  const clubs = new Map<string, FixtureAthlete[]>()
  for (const a of athletes) clubs.set(a.club ?? 'SCX', [...(clubs.get(a.club ?? 'SCX') ?? []), a])

  const clubXml = [...clubs].map(([code, list]) => {
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<LENEX version="3.0"><MEETS><MEET city="${city}" name="BEO-Cup ${city}">
<AGEDATE value="${date}" type="YEAR" />
<SESSIONS><SESSION date="${date}" number="1"><EVENTS>${events.join('')}</EVENTS></SESSION></SESSIONS>
<CLUBS>${clubXml.join('')}</CLUBS>
</MEET></MEETS></LENEX>`
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
