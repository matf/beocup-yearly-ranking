import CFB from 'cfb'
import JSZip from 'jszip'
import type { Gender, Person, Stroke } from './types'
import { STROKES } from './types'
import { normalizeName } from './normalize'

/**
 * Entry forms in Word (Gstaad/Saanen has no Team Manager): one line per swimmer,
 * `Lastname Firstname <tab> YY <tab> Fly <tab> Back <tab> Breast <tab> Free`, followed by relay lines.
 */

export interface FormRow {
  /** position in the form, 1-based */
  row: number
  /** "Lastname Firstname" as written */
  name: string
  /** 0 if missing or unreadable */
  birthYear: number
  /** entry times in hundredths; a stroke without time is not entered */
  times: Partial<Record<Stroke, number>>
  /** German: what was read in a way the operator must confirm (typos, shifted columns) */
  questions: string[]
  /** German: what the operator must fix; nothing is guessed for these */
  errors: string[]
}

export interface WordForm {
  title: string
  rows: FormRow[]
  /** non-empty lines that are no swimmer lines (title, header, relays), shown for checking */
  ignored: string[]
}

/**
 * A form row prepared for the entry file; the operator can edit every field. Nothing uncertain
 * is filled in silently: missing values are errors, interpretations are questions to confirm.
 */
export interface FormSwimmer {
  row: number
  lastname: string
  firstname: string
  /** 0 if missing: the operator must enter it */
  birthYear: number
  /** real birthdate from the results with the same birth year, otherwise `YYYY-01-01` (year only) */
  birthdate: string
  /** set only if the results know this swimmer with the same birth year and one gender */
  gender: Gender | ''
  times: Partial<Record<Stroke, number>>
  /** found in the comparison results */
  known: boolean
  /** German: to be confirmed by the operator */
  questions: string[]
  /** German: to be fixed by the operator */
  errors: string[]
  /** German: for information */
  info: string[]
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b

/** Plain text of a .doc (Word 97–2003) or .docx file; table cells become tabs. */
export async function readWordText(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return isZip(bytes) ? docxText(bytes) : docText(bytes)
}

/**
 * Word 97 binary: the text is stored in pieces listed in the piece table (CLX) of the table
 * stream; each piece is either 8-bit (cp1252) or UTF-16. Only the main document is read.
 */
export function docText(bytes: Uint8Array): string {
  let cfb: CFB.CFB$Container
  try {
    cfb = CFB.read(bytes, { type: 'array' })
  } catch {
    throw new Error('Keine Word-Datei (.doc/.docx).')
  }
  const stream = (name: string) => {
    const entry = CFB.find(cfb, name)
    return entry?.content ? new Uint8Array(entry.content as ArrayLike<number>) : undefined
  }
  const word = stream('WordDocument')
  if (!word) throw new Error('Keine Word-Datei (.doc/.docx).')
  const w = new DataView(word.buffer, word.byteOffset, word.byteLength)
  if (w.getUint16(0, true) !== 0xa5ec) throw new Error('Unbekanntes Word-Format.')
  const table = stream(w.getUint16(0x0a, true) & 0x0200 ? '1Table' : '0Table')
  if (!table) throw new Error('Word-Datei ohne Tabellen-Stream.')
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength)
  const ccpText = w.getUint32(0x4c, true)
  let pos = w.getUint32(0x01a2, true) // fcClx
  while (table[pos] === 0x01) pos += 3 + t.getUint16(pos + 1, true) // skip property modifiers (Prc)
  if (table[pos] !== 0x02) throw new Error('Word-Datei nicht lesbar (Stückliste fehlt).')
  const lcb = t.getUint32(pos + 1, true)
  const plc = pos + 5
  const n = (lcb - 4) / 12
  const cp1252 = new TextDecoder('windows-1252')
  const utf16 = new TextDecoder('utf-16le')
  let text = ''
  for (let i = 0; i < n && text.length < ccpText; i++) {
    const cpStart = t.getUint32(plc + i * 4, true)
    const cpEnd = Math.min(t.getUint32(plc + (i + 1) * 4, true), ccpText)
    if (cpEnd <= cpStart) continue
    const fc = t.getUint32(plc + (n + 1) * 4 + i * 8 + 2, true)
    const len = cpEnd - cpStart
    if (fc & 0x40000000) {
      const off = (fc & 0x3fffffff) / 2
      text += cp1252.decode(word.subarray(off, off + len))
    } else {
      text += utf16.decode(word.subarray(fc, fc + len * 2))
    }
  }
  return text
    .replace(/\x13[^\x14\x15]*\x14?/g, '') // field instructions; the field result stays
    .replace(/\x15/g, '')
    .replace(/\x07\x07/g, '\r') // end of a table row
    .replace(/\x07/g, '\t') // end of a table cell
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('Keine Word-Datei (.doc/.docx).')
  const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const runs = (s: string) =>
    [...s.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((m) => (m[1] !== undefined ? decode(m[1]) : m[0] === '<w:tab/>' ? '\t' : '\n')).join('')
  const paragraphs = (s: string) => [...s.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => runs(m[0]))
  const body = xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (row) =>
    `<w:p><w:r><w:t>${[...row.matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((c) => paragraphs(c[0]).join(' ')).join('\u0001')}</w:t></w:r></w:p>`,
  )
  return paragraphs(body).join('\n').replace(/\u0001/g, '\t')
}

/**
 * Entry time as written in the form: "37.40", "47.5", "1:04.3". A typo such as "42.18j" or
 * "52:00" (for 52.00) is read with a `question` the operator must confirm. "---", "x" and empty
 * cells mean not entered.
 */
export function parseEntryTime(raw: string): { time: number | null; question?: string; error?: string } {
  const text = raw.trim()
  if (!text || /^(-+|x)$/i.test(text)) return { time: null }
  const cleaned = text.replace(',', '.').replace(/[^0-9:.]/g, '')
  const note = cleaned !== text ? `«${text}» gelesen als ` : ''
  let m = /^(\d{2})[.:](\d{1,2})$/.exec(cleaned)
  if (m && Number(m[1]) >= 15) {
    const time = Number(m[1]) * 100 + Number(m[2].padEnd(2, '0'))
    return { time, question: (note || cleaned.includes(':')) ? `«${text}» gelesen als ${m[1]}.${m[2].padEnd(2, '0')}` : undefined }
  }
  m = /^(\d{2})$/.exec(cleaned)
  if (m && Number(m[1]) >= 15) return { time: Number(m[1]) * 100, question: note ? `${note}${m[1]}.00` : undefined }
  m = /^(\d):(\d{2})(?:[.:](\d{1,2}))?$/.exec(cleaned)
  if (m && Number(m[2]) < 60) {
    const time = (Number(m[1]) * 60 + Number(m[2])) * 100 + Number((m[3] ?? '0').padEnd(2, '0'))
    return { time, question: note ? `${note}${m[1]}:${m[2]}.${(m[3] ?? '0').padEnd(2, '0')}` : undefined }
  }
  return { time: null, error: `Zeit «${text}» nicht lesbar` }
}

/** a cell that is clearly a time, as written in the form (not "Vierlagen: 2:40.0") */
const TIME_CELL = /^\s*(\d:)?\d{2}[.,:]\d{1,2}\s*$/

/**
 * Reads the swimmer lines of a form. A swimmer line has a name and a two- or four-digit birth
 * year, or a name and at least two times (then the year is missing: an error, not a guess).
 * All other non-empty lines are returned as `ignored`, so the operator can see what was skipped.
 */
export function parseWordForm(text: string): WordForm {
  const lines = text.split(/\r\n|\r|\n|\x0b/)
  const title = (lines.find((l) => /anmeldung/i.test(l)) ?? lines.find((l) => l.trim()) ?? '').trim()
  const rows: FormRow[] = []
  const ignored: string[] = []
  for (const line of lines) {
    const fields = line.split('\t')
    const year = fields[1]?.trim() ?? ''
    const hasName = /\p{L}{2}/u.test(fields[0]) && !/:\s*$/.test(fields[0].trim())
    const yearOk = /^(\d{2}|\d{4})$/.test(year)
    const timeCount = fields.slice(1).filter((f) => TIME_CELL.test(f)).length
    if (!hasName || (!yearOk && timeCount < 2)) {
      if (line.trim()) ignored.push(line.replace(/\t+/g, '  ').trim())
      continue
    }
    const row: FormRow = {
      row: rows.length + 1,
      name: fields[0].trim().replace(/\s+/g, ' '),
      birthYear: yearOk ? (year.length === 2 ? 2000 + Number(year) : Number(year)) : 0,
      times: {},
      questions: [],
      errors: [],
    }
    // without a year column the times start right after the name
    const cells = fields.slice(yearOk || !TIME_CELL.test(year) ? 2 : 1)
    if (!yearOk) row.errors.push(year && !TIME_CELL.test(year) ? `Jahrgang «${year}» nicht lesbar` : 'Jahrgang fehlt')
    while (cells.length && !cells[cells.length - 1].trim()) cells.pop()
    // a stray tab adds an empty cell: drop empty cells from the right until 4 remain, and ask
    let shifted = false
    while (cells.length > STROKES.length) {
      const empty = cells.map((c) => !c.trim()).lastIndexOf(true)
      if (empty < 0) break
      cells.splice(empty, 1)
      shifted = true
    }
    if (cells.length > STROKES.length) row.errors.push(`${cells.length} Zeiten statt höchstens 4: Lagen nicht eindeutig`)
    else if (shifted) row.questions.push('Leere Zelle zu viel in der Zeile: Zuordnung der Zeiten zu den Lagen prüfen')
    cells.slice(0, STROKES.length).forEach((cell, i) => {
      const { time, question, error } = parseEntryTime(cell)
      if (time !== null) row.times[STROKES[i]] = time
      if (question) row.questions.push(question)
      if (error) row.errors.push(error)
    })
    rows.push(row)
  }
  return { title, rows, ignored }
}

/**
 * Splits the name and takes gender and birthdate from the comparison results. The form has no
 * gender: it is set only for a swimmer the results know with the same birth year and a single
 * gender. Everything else is left to the operator.
 */
export function prepareSwimmers(rows: FormRow[], persons: Person[]): FormSwimmer[] {
  const byName = new Map<string, Person[]>()
  for (const p of persons) {
    const key = `${normalizeName(p.lastname)}|${normalizeName(p.firstname)}`
    byName.set(key, [...(byName.get(key) ?? []), p])
  }
  return rows.map((row) => {
    const words = row.name.split(' ')
    // try every split into last and first name; the form writes "Lastname Firstname"
    let split = words.length - 1
    let found: Person[] = []
    for (let i = words.length - 1; i >= 1 && !found.length; i--) {
      const list = byName.get(`${normalizeName(words.slice(0, i).join(' '))}|${normalizeName(words.slice(i).join(' '))}`)
      if (list) {
        split = i
        found = list
      }
    }
    const sameYear = found.filter((p) => p.birthYear === row.birthYear)
    const genders = new Set(sameYear.map((p) => p.gender))
    const questions = [...row.questions]
    const errors = [...row.errors]
    const info: string[] = []
    if (!found.length && words.length > 2) {
      questions.push(`Name aus ${words.length} Wörtern: Aufteilung in Nachname und Vorname prüfen`)
    }
    if (words.length < 2) errors.push('Nachname oder Vorname fehlt')
    if (found.length && !sameYear.length && row.birthYear) {
      const other = found.map((p) => `Jahrgang ${p.birthYear}, ${p.gender}`)
      questions.push(`In den Resultaten mit ${[...new Set(other)].join(' / ')}: Jahrgang prüfen`)
    }
    if (genders.size > 1) info.push('In den Resultaten mit beiden Geschlechtern')
    if (!found.length) info.push('Nicht in den Vergleichs-Resultaten')
    const birthdate =
      sameYear
        .flatMap((p) => p.entries.map((e) => e.birthdate))
        .reverse()
        .find((d) => d.startsWith(`${row.birthYear}-`) && !d.endsWith('-01-01')) ?? (row.birthYear ? `${row.birthYear}-01-01` : '')
    return {
      row: row.row,
      lastname: words.slice(0, split).join(' '),
      firstname: words.slice(split).join(' '),
      birthYear: row.birthYear,
      birthdate,
      gender: genders.size === 1 ? [...genders][0] : '',
      times: { ...row.times },
      known: found.length > 0,
      questions,
      errors,
      info,
    }
  })
}
