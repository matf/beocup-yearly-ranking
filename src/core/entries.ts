import type { Cup, Entry, EntryFile, EntrySwimmer, Person, Stroke } from './types'
import { STROKES } from './types'
import { type Category, categoryForAge } from './scoring'
import { autoKey } from './matching'
import { classifyPair, realBirthdates } from './issues'
import { CLUBS, clubName } from './clubs'
import { normalizeName } from './normalize'
import { STROKE_LABELS, formatDate } from './format'

export type FindingType =
  | 'strokes'
  | 'fly'
  | 'eventGender'
  | 'birthyear'
  | 'gender'
  | 'similar'
  | 'birthdate'
  | 'duplicate'
  | 'placeholder'
  | 'club'
  | 'new'

export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  type: FindingType
  severity: Severity
  /** German, for display */
  text: string
}

export interface EntryCheck {
  file: EntryFile
  swimmer: EntrySwimmer
  category: Category
  /** current club name (clubs.ts) */
  club: string
  /** the person in the comparison results with the same name, birth year and gender */
  match?: Person
  findings: Finding[]
}

export interface MeetCheck {
  meetId: string
  meetName: string
  city: string
  date: string
  checks: EntryCheck[]
}

export interface ReplacedFile {
  file: EntryFile
  club: string
  by: EntryFile
}

/** Kat. V and IV swim Back, Breast and Free; Fly is optional (Reglement §5). */
const YOUTH_STROKES: Stroke[] = ['BACK', 'BREAST', 'FREE']

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info']

const strokeList = (strokes: Stroke[]) => strokes.map((s) => STROKE_LABELS[s]).join(', ')

/** newer file first; files without a creation time count as oldest, then the later loaded one wins */
function newer(a: EntryFile, b: EntryFile, files: EntryFile[]): boolean {
  if (a.created !== b.created) return a.created > b.created
  return files.indexOf(a) > files.indexOf(b)
}

/**
 * Per cup and club, only the newest entry file counts: a club that sends a corrected file
 * replaces its earlier one. Clubs are compared by their current name, so INT and INTA are one club.
 */
export function activeEntries(files: EntryFile[]): { swimmers: { file: EntryFile; swimmer: EntrySwimmer }[]; replaced: ReplacedFile[] } {
  const newest = new Map<string, EntryFile>()
  for (const file of files) {
    for (const club of new Set(file.swimmers.map((s) => clubName(s.clubCode, s.clubName)))) {
      const key = `${file.meetId}|${club}`
      const current = newest.get(key)
      if (!current || newer(file, current, files)) newest.set(key, file)
    }
  }
  const swimmers: { file: EntryFile; swimmer: EntrySwimmer }[] = []
  const replaced: ReplacedFile[] = []
  for (const file of files) {
    const seen = new Set<string>()
    for (const swimmer of file.swimmers) {
      const club = clubName(swimmer.clubCode, swimmer.clubName)
      const by = newest.get(`${file.meetId}|${club}`)!
      if (by === file) swimmers.push({ file, swimmer })
      else if (!seen.has(club)) replaced.push({ file, club, by })
      seen.add(club)
    }
  }
  return { swimmers, replaced }
}

export function strokeFindings(swimmer: EntrySwimmer, category: Category): Finding[] {
  const entered = new Set(swimmer.strokes)
  const findings: Finding[] = []
  if (entered.size === 0) {
    findings.push(
      swimmer.otherEvents
        ? { type: 'strokes', severity: 'warning', text: 'Keine 50-m-Einzelstrecke gemeldet, nur andere Wettkämpfe' }
        : { type: 'strokes', severity: 'error', text: 'Keine Disziplin gemeldet' },
    )
  } else if (category === 'V' || category === 'IV') {
    const missing = YOUTH_STROKES.filter((s) => !entered.has(s))
    if (entered.size < 3) {
      findings.push({ type: 'strokes', severity: 'error', text: `Nur ${entered.size} von 3 Disziplinen gemeldet, es fehlt: ${strokeList(missing)}` })
    } else if (missing.length) {
      findings.push({ type: 'fly', severity: 'warning', text: `Delfin statt ${strokeList(missing)} gemeldet (Kat. ${category}: Rücken, Brust, Freistil)` })
    }
  } else {
    const missing = STROKES.filter((s) => !entered.has(s))
    if (missing.length) {
      findings.push({ type: 'strokes', severity: 'error', text: `Nur ${entered.size} von 4 Disziplinen gemeldet, es fehlt: ${strokeList(missing)}` })
    }
  }
  if (swimmer.wrongGender.length) {
    findings.push({ type: 'eventGender', severity: 'error', text: `Im Wettkampf des anderen Geschlechts gemeldet: ${strokeList(swimmer.wrongGender)}` })
  }
  return findings
}

/** The swimmer as a one-entry person, so the matching rules of the Prüfen tab apply. */
function asPerson(file: EntryFile, swimmer: EntrySwimmer): Person {
  const entry: Entry = { ...swimmer, key: `${file.id}:${swimmer.athleteId}`, cupId: file.meetId, results: {} }
  return { id: entry.key, entries: [entry], ...swimmer, clubName: clubName(swimmer.clubCode, swimmer.clubName) }
}

/**
 * Checks the active entries of each cup against the comparison results:
 * - disciplines: Kat. V/IV Back, Breast and Free (Fly optional), Kat. III–I all 4 strokes
 * - birth year and gender against the same swimmer in the results
 * - similar names, a differing birthdate, double entries, placeholder birthdates, unknown clubs
 */
export function checkEntries(files: EntryFile[], cups: Cup[], persons: Person[]): MeetCheck[] {
  const cupById = new Map(cups.map((c) => [c.id, c]))
  const where = (e: Entry) => {
    const c = cupById.get(e.cupId)
    return c ? `${c.city} ${formatDate(c.date)}` : e.cupId
  }
  const byKey = new Map<string, Person>()
  for (const p of persons) for (const e of p.entries) byKey.set(autoKey(e), p)
  const knownClubs = new Set(CLUBS.map((c) => c.name))

  const { swimmers } = activeEntries(files)
  // the same swimmer entered twice for one cup: by two clubs, or twice in one club's file
  const sameName = new Map<string, string[]>()
  const nameKey = (file: EntryFile, s: EntrySwimmer) => `${file.meetId}|${normalizeName(`${s.lastname} ${s.firstname}`)}|${s.birthYear}`
  for (const { file, swimmer } of swimmers) {
    const key = nameKey(file, swimmer)
    sameName.set(key, [...(sameName.get(key) ?? []), clubName(swimmer.clubCode, swimmer.clubName)])
  }

  const meets = new Map<string, MeetCheck>()
  for (const { file, swimmer } of swimmers) {
    const category = categoryForAge(file.year - swimmer.birthYear)
    const club = clubName(swimmer.clubCode, swimmer.clubName)
    const self = asPerson(file, swimmer)
    const match = byKey.get(autoKey(self.entries[0]))
    const findings = strokeFindings(swimmer, category)

    if (match) {
      // a birthdate whose year the operator corrected is outdated
      const dates = new Set([...realBirthdates(match)].filter((d) => match.entries.some((e) => e.birthdate === d && e.birthYear === Number(d.slice(0, 4)))))
      if (dates.size && !swimmer.birthdate.endsWith('-01-01') && !dates.has(swimmer.birthdate)) {
        findings.push({
          type: 'birthdate',
          severity: 'warning',
          text: `Geburtsdatum ${formatDate(swimmer.birthdate)}, in den Resultaten ${[...dates].map(formatDate).join(' / ')}`,
        })
      }
    }
    for (const other of persons) {
      if (other === match) continue
      const type = classifyPair(self, other)
      if (!type) continue
      const latest = other.entries[other.entries.length - 1]
      const differs: string[] = []
      if (other.birthYear !== swimmer.birthYear) differs.push(`Jahrgang ${other.birthYear}`)
      if (other.gender !== swimmer.gender) differs.push(`Geschlecht ${other.gender}`)
      if ((type === 'birthyear' || type === 'gender') && !differs.length) continue
      const ref = `${other.lastname} ${other.firstname}, ${other.birthYear}, ${other.gender} (${where(latest)})`
      if (type === 'birthyear' || type === 'gender') {
        // a known swimmer with other data in some results is a hint; otherwise the entry is probably wrong
        findings.push(
          match
            ? { type, severity: 'warning', text: `In anderen Resultaten mit ${differs.join(', ')}: ${where(latest)}` }
            : { type, severity: 'error', text: `In den Resultaten mit ${differs.join(', ')} (${where(latest)})` },
        )
      } else if (!match) {
        const label = type === 'swapped' ? 'Vor-/Nachname vertauscht?' : 'Ähnlich:'
        findings.push({ type: 'similar', severity: 'warning', text: `${label} ${ref}` })
      }
    }
    if (!match && !findings.some((f) => f.type === 'birthyear' || f.type === 'gender' || f.type === 'similar')) {
      findings.push({ type: 'new', severity: 'info', text: 'Nicht in den Vergleichs-Resultaten' })
    }

    const clubs = sameName.get(nameKey(file, swimmer))!
    if (clubs.length > 1) {
      findings.push({ type: 'duplicate', severity: 'warning', text: `${clubs.length}× gemeldet (${[...new Set(clubs)].join(', ')})` })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(swimmer.birthdate) || swimmer.birthdate.endsWith('-01-01')) {
      findings.push({ type: 'placeholder', severity: 'info', text: 'Geburtsdatum unvollständig (nur Jahrgang)' })
    }
    if (!knownClubs.has(club)) {
      findings.push({ type: 'club', severity: 'info', text: `Verein ${swimmer.clubCode} ist keiner der sechs BEO-Cup-Vereine` })
    }

    findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    const meet = meets.get(file.meetId) ?? { meetId: file.meetId, meetName: file.meetName, city: file.city, date: file.date, checks: [] }
    meet.checks.push({ file, swimmer, category, club, match, findings })
    meets.set(file.meetId, meet)
  }

  for (const meet of meets.values()) {
    meet.checks.sort(
      (a, b) =>
        a.club.localeCompare(b.club, 'de') ||
        `${a.swimmer.lastname} ${a.swimmer.firstname}`.localeCompare(`${b.swimmer.lastname} ${b.swimmer.firstname}`, 'de'),
    )
  }
  return [...meets.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function worstSeverity(check: EntryCheck): Severity | null {
  return check.findings[0]?.severity ?? null
}
