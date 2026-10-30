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
  birthYear: number
  /** entry times in hundredths; a stroke without time is not entered */
  times: Partial<Record<Stroke, number>>
  /** German notes about interpreted cells */
  notes: string[]
  /** German problems the operator must fix */
  errors: string[]
}

export interface WordForm {
  title: string
  rows: FormRow[]
}

/** A form row prepared for the entry file; the operator can edit every field. */
export interface FormSwimmer {
  row: number
  lastname: string
  firstname: string
  birthYear: number
  /** real birthdate from the results, otherwise `YYYY-01-01` */
  birthdate: string
  /** empty until known from the results or chosen by the operator */
  gender: Gender | ''
  times: Partial<Record<Stroke, number>>
  /** found in the comparison results */
  known: boolean
  notes: string[]
  errors: string[]
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
 * Entry time as written in the form: "37.40", "47.5", "1:04.3"; typos such as "42.18j" or
 * "52:00" (for 52.00) are read with a note. "---", "x" and empty cells mean not entered.
 */
export function parseEntryTime(raw: string): { time: number | null; note?: string; error?: string } {
  const text = raw.trim()
  if (!text || /^(-+|x)$/i.test(text)) return { time: null }
  const cleaned = text.replace(',', '.').replace(/[^0-9:.]/g, '')
  const note = cleaned !== text ? `«${text}» gelesen als ` : ''
  let m = /^(\d{2})[.:](\d{1,2})$/.exec(cleaned)
  if (m && Number(m[1]) >= 15) {
    const time = Number(m[1]) * 100 + Number(m[2].padEnd(2, '0'))
    return { time, note: (note || cleaned.includes(':')) ? `«${text}» gelesen als ${m[1]}.${m[2].padEnd(2, '0')}` : undefined }
  }
  m = /^(\d{2})$/.exec(cleaned)
  if (m && Number(m[1]) >= 15) return { time: Number(m[1]) * 100, note: note ? `${note}${m[1]}.00` : undefined }
  m = /^(\d):(\d{2})(?:[.:](\d{1,2}))?$/.exec(cleaned)
  if (m && Number(m[2]) < 60) {
    const time = (Number(m[1]) * 60 + Number(m[2])) * 100 + Number((m[3] ?? '0').padEnd(2, '0'))
    return { time, note: note ? `${note}${m[1]}:${m[2]}.${(m[3] ?? '0').padEnd(2, '0')}` : undefined }
  }
  return { time: null, error: `Zeit «${text}» nicht lesbar` }
}

/** Reads the swimmer lines of a form; relay and other lines are ignored. */
export function parseWordForm(text: string): WordForm {
  const lines = text.split(/\r\n|\r|\n|\x0b/)
  const title = (lines.find((l) => /anmeldung/i.test(l)) ?? lines.find((l) => l.trim()) ?? '').trim()
  const rows: FormRow[] = []
  for (const line of lines) {
    const fields = line.split('\t')
    const year = fields[1]?.trim() ?? ''
    if (!/^(\d{2}|\d{4})$/.test(year) || !/\p{L}{2}/u.test(fields[0])) continue
    const cells = fields.slice(2)
    while (cells.length && !cells[cells.length - 1].trim()) cells.pop()
    // a stray tab adds an empty cell: drop empty cells from the right until 4 remain
    while (cells.length > STROKES.length) {
      const empty = cells.map((c) => !c.trim()).lastIndexOf(true)
      if (empty < 0) break
      cells.splice(empty, 1)
    }
    const row: FormRow = {
      row: rows.length + 1,
      name: fields[0].trim().replace(/\s+/g, ' '),
      birthYear: year.length === 2 ? 2000 + Number(year) : Number(year),
      times: {},
      notes: [],
      errors: [],
    }
    if (cells.length > STROKES.length) row.errors.push(`${cells.length} Zeiten statt höchstens 4`)
    cells.slice(0, STROKES.length).forEach((cell, i) => {
      const { time, note, error } = parseEntryTime(cell)
      if (time !== null) row.times[STROKES[i]] = time
      if (note) row.notes.push(note)
      if (error) row.errors.push(error)
    })
    rows.push(row)
  }
  return { title, rows }
}

/**
 * Splits the name and takes gender and birthdate from the comparison results. The form has no
 * gender; a swimmer not found in the results gets none and the operator must choose it.
 */
export function prepareSwimmers(rows: FormRow[], persons: Person[]): FormSwimmer[] {
  const byName = new Map<string, Person[]>()
  for (const p of persons) {
    const key = `${normalizeName(p.lastname)}|${normalizeName(p.firstname)}`
    byName.set(key, [...(byName.get(key) ?? []), p])
  }
  return rows.map((row) => {
    const words = row.name.split(' ')
    // try every split into last and first name, default: the last word is the first name
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
    const candidates = sameYear.length ? sameYear : found
    const genders = new Set(candidates.map((p) => p.gender))
    const notes = [...row.notes]
    if (found.length && !sameYear.length) {
      notes.push(`In den Resultaten mit Jahrgang ${[...new Set(found.map((p) => p.birthYear))].join(' / ')}`)
    }
    if (genders.size > 1) notes.push('In den Resultaten mit beiden Geschlechtern')
    if (!found.length) notes.push('Nicht in den Vergleichs-Resultaten')
    const birthdate =
      sameYear
        .flatMap((p) => p.entries.map((e) => e.birthdate))
        .reverse()
        .find((d) => d.startsWith(`${row.birthYear}-`) && !d.endsWith('-01-01')) ?? `${row.birthYear}-01-01`
    return {
      row: row.row,
      lastname: words.slice(0, split).join(' '),
      firstname: words.slice(split).join(' '),
      birthYear: row.birthYear,
      birthdate,
      gender: genders.size === 1 ? [...genders][0] : '',
      times: { ...row.times },
      known: found.length > 0,
      notes,
      errors: [...row.errors],
    }
  })
}
