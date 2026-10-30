import JSZip from 'jszip'
import type { Gender, MeetTemplate, Stroke } from './types'
import { STROKES } from './types'

export interface WriterSwimmer {
  lastname: string
  firstname: string
  birthdate: string
  gender: Gender
  times: Partial<Record<Stroke, number>>
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** hundredths → LENEX "HH:MM:SS.hh" */
export function lenexTime(hundredths: number): string {
  const h = Math.round(hundredths)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `00:${pad(Math.floor(h / 6000))}:${pad(Math.floor((h % 6000) / 100))}.${pad(h % 100)}`
}

/**
 * A club entry file like a SPLASH Team Manager export: the meet and its events from the
 * announcement, one club, each swimmer with an ENTRY per entered 50m stroke. The event
 * numbers and ids are the announcement's, so the Meet Manager can assign the entries.
 */
export function buildEntryLenex(meet: MeetTemplate, club: { code: string; name: string }, swimmers: WriterSwimmer[], created: string): string {
  const eventFor = (stroke: Stroke, gender: Gender) => {
    const e = meet.events.find((x) => x.distance === '50' && x.relaycount === '1' && x.stroke === stroke && x.gender === gender)
    if (!e) throw new Error(`Die Ausschreibung hat keinen Wettkampf 50 m ${stroke} ${gender}.`)
    return e
  }
  const events = meet.events
    .map(
      (e) =>
        `          <EVENT eventid="${escape(e.eventid)}" number="${escape(e.number)}"${e.gender ? ` gender="${escape(e.gender)}"` : ''} preveventid="-1">\n` +
        `            <SWIMSTYLE distance="${escape(e.distance)}" relaycount="${escape(e.relaycount)}" stroke="${escape(e.stroke)}" />\n` +
        '          </EVENT>',
    )
    .join('\n')
  const athletes = swimmers
    .map((s, i) => {
      const entries = STROKES.filter((st) => s.times[st])
        .map((st) => `                <ENTRY eventid="${escape(eventFor(st, s.gender).eventid)}" entrytime="${lenexTime(s.times[st]!)}" />`)
        .join('\n')
      return (
        `            <ATHLETE athleteid="${i + 1}" lastname="${escape(s.lastname)}" firstname="${escape(s.firstname)}" gender="${s.gender}" birthdate="${escape(s.birthdate)}">\n` +
        `              <ENTRIES>\n${entries}\n              </ENTRIES>\n` +
        '            </ATHLETE>'
      )
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<LENEX version="3.0" created="${escape(created)}">
  <CONSTRUCTOR name="BEO-Cup Jahreswertung" registration="${escape(club.name)}" version="1">
    <CONTACT name="BEO-Cup Jahreswertung" />
  </CONSTRUCTOR>
  <MEETS>
    <MEET name="${escape(meet.name)}" city="${escape(meet.city)}" nation="SUI" course="SCM">
      <AGEDATE value="${escape(meet.date)}" type="YEAR" />
      <SESSIONS>
        <SESSION number="1" date="${escape(meet.date)}">
          <EVENTS>
${events}
          </EVENTS>
        </SESSION>
      </SESSIONS>
      <CLUBS>
        <CLUB name="${escape(club.name)}" code="${escape(club.code)}" nation="SUI" region="RZW">
          <ATHLETES>
${athletes}
          </ATHLETES>
        </CLUB>
      </CLUBS>
    </MEET>
  </MEETS>
</LENEX>
`
}

/** Zips the LENEX XML into an .lxf, as SPLASH does. */
export async function zipLenex(xml: string, baseName: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(`${baseName}.lef`, xml)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
