/**
 * Runs against the real result files in results/ (not in git – personal data), including the
 * archive of past years. Skipped automatically when the folder is missing.
 *
 * Result files are found automatically: every .lxf below results/ that contains swim times
 * (entry and announcement files have none). Each SPLASH export (.csv, or a .txt in the same
 * format) is compared with the result file of the same cup folder (`YYYY-MM …`), or with the
 * .lxf of the same name. Each published Rangliste PDF is matched to its cup by the place and
 * date in its heading and needs `pdftotext` (poppler); without it those tests are skipped.
 *
 * No names here on purpose: the repository must not contain real swimmer data.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCupFile } from '../lenex'
import { buildPersons, sharesCup } from '../matching'
import { findIssues } from '../issues'
import { categoryForAge, computeRanking, effectiveTime, isValidResult, scoreEntry } from '../scoring'
import { emptyCorrections } from '../corrections'
import { normalizeName, similarity } from '../normalize'
import { formatTime } from '../format'
import { CLUBS } from '../clubs'
import type { Cup, Entry, Stroke } from '../types'
import { STROKES } from '../types'

const DIR = resolve(__dirname, '../../../results')
const SKIP_DIRS = /^(meldungen|ausschreibung|backup|splash|splash backup)$/i

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return SKIP_DIRS.test(name) ? [] : walk(path)
    return [path]
  })
}

const files = existsSync(DIR) ? walk(DIR) : []
const lxfFiles = files.filter((f) => f.toLowerCase().endsWith('.lxf'))
/** SPLASH exports: .csv, and .txt files in the same tab-separated format */
const csvFiles = files.filter(
  (f) => /\.csv$/i.test(f) || (/\.txt$/i.test(f) && readFileSync(f, 'latin1').startsWith('NAME\tBIRTHDATE')),
)
const rankingPdfs = files.filter((f) => /\.pdf$/i.test(f) && /rangliste/i.test(basename(f)) && !/staffel/i.test(basename(f)))

function hasPdftotext(): boolean {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' })
    execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** The cup folder (`2025-05-25 Aeschi`, `2026-08 Thun`) a file belongs to, or its own folder. */
function cupFolder(path: string): string {
  for (let d = dirname(path); d.startsWith(DIR) && d !== DIR; d = dirname(d)) {
    if (/^\d{4}-\d{2}/.test(basename(d))) return d
  }
  return dirname(path)
}

/**
 * Mehrkampf results from a SPLASH export: "LAST, First" + birthdate → category and total.
 * `withoutTotal` holds the swimmers of that cup without a Mehrkampf total (too few valid times).
 */
function readCsvTotals(path: string) {
  const text = new TextDecoder('latin1').decode(readFileSync(path))
  const rows = text.split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split('\t'))
  const totals = new Map<string, { category: string; time: string }>()
  const withoutTotal = new Set<string>()
  for (const row of rows) {
    if (!row[1]?.includes('.')) continue
    const [day, month, year] = row[1].split('.')
    const key = `${normalizeName(row[0].replace(',', ''))}|${year}-${month}-${day}`
    const idx = row.findIndex((c) => /^Kategorie (I|II|III|IV|V) /.test(c))
    if (idx < 0 || !row[idx + 1]) withoutTotal.add(key)
    else totals.set(key, { category: row[idx].split(' ')[1], time: row[idx + 1] })
  }
  return { totals, withoutTotal }
}

interface PdfRow {
  category: string
  last: string
  first: string
  yy: string
  total: string
  strokes: number
  /** per stroke: counted (not in parentheses) and DSQ (marked with *) */
  cells: Partial<Record<Stroke, { counted: boolean; dsq: boolean }>>
}

/**
 * The Mehrkampf section of a published SPLASH Rangliste (pdftotext -layout). A row reads
 * `1. LAST, First  YY CLUB  2:33.863  (58.14)*  53.38 …`: the total is followed by the number
 * of strokes in it, times in parentheses do not count, * marks a DSQ. A row with fewer strokes
 * than the category needs is an incomplete Mehrkampf with its partial sum. Tied swimmers after
 * the first one have no rank number.
 */
function readRankingPdf(path: string) {
  const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' })
  const lines = text.split('\n')
  const heading = lines.map((l) => /^\s*([A-Za-zÄÖÜäöüé .-]+),\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(l)).find(Boolean)
  const rows: PdfRow[] = []
  let category = ''
  let columns: number[] = []
  let pending = ''
  for (const line of lines) {
    if (/Tagessieg/.test(line)) break
    const cat = /^\s*Kategorie (I|II|III|IV|V)\s*$/.exec(line)
    if (cat) {
      category = cat[1]
      continue
    }
    if (line.includes('50m Rü')) {
      const fly = line.includes('50m Sm') ? '50m Sm' : '50m De'
      columns = [fly, '50m Rü', '50m Br', '50m Fr'].map((h) => line.indexOf(h) + h.length)
      continue
    }
    if (!category || !columns.length) continue
    const total = /(\d{1,2}:\d\d\.\d\d)(\d)\s/.exec(line + ' ')
    if (!total) {
      // a long name wraps; the total follows on a later line
      if (/^\s*\d+\.\s+\S/.test(line) || (pending && line.trim())) pending = `${pending} ${line.trim()}`.trim()
      continue
    }
    const prefix = `${pending} ${line.slice(0, total.index)}`.trim()
    pending = ''
    const m = /^(?:(\d+)\.\s+)?(.+?),\s*(.*?)\s*((?:\d\s?){2})\s*([A-Za-z.\s]*?)\s*([A-Za-z]+)$/.exec(prefix)
    if (!m) continue
    const cells: PdfRow['cells'] = {}
    const after = total.index + total[0].length - 1
    for (const c of line.slice(after).matchAll(/\(?(?:\d{1,2}:)?\d{1,2}\.\d\d\)?\*?/g)) {
      const end = after + c.index! + c[0].length
      const col = columns.reduce((best, x, i) => (Math.abs(x - end) < Math.abs(columns[best] - end) ? i : best), 0)
      cells[STROKES[col]] = { counted: !c[0].startsWith('('), dsq: c[0].endsWith('*') }
    }
    rows.push({
      category,
      last: m[2],
      first: `${m[3]} ${m[5]}`.trim().replace(/\.$/, ''),
      yy: m[4].replace(/\s/g, ''),
      total: total[1],
      strokes: Number(total[2]),
      cells,
    })
  }
  // ISO date like 2024-10-26T12:25:48+01 – the default format has time zone names Date cannot parse
  const created = /CreationDate:\s*(\S+)/.exec(execFileSync('pdfinfo', ['-isodates', path], { encoding: 'utf8' }))?.[1] ?? ''
  return {
    city: heading?.[1].trim() ?? '',
    date: heading ? `${heading[4]}-${heading[3].padStart(2, '0')}-${heading[2].padStart(2, '0')}` : '',
    created: Date.parse(created.replace(/([+-]\d\d)$/, '$1:00')) || 0,
    rows,
  }
}

const pdfCache = new Map<string, ReturnType<typeof readRankingPdf>>()
function rankingPdf(path: string) {
  if (!pdfCache.has(path)) pdfCache.set(path, readRankingPdf(path))
  return pdfCache.get(path)!
}

/** A preliminary ranking printed on the day can be superseded by a corrected one of the same cup. */
function isSuperseded(path: string): boolean {
  const own = rankingPdf(path)
  return rankingPdfs.some((other) => {
    if (other === path) return false
    const o = rankingPdf(other)
    return o.city === own.city && o.date === own.date && o.created > own.created
  })
}

const sorted = (list: Iterable<string>) => [...list].sort()

describe.skipIf(lxfFiles.length === 0)('real results', () => {
  /** result file path → cup, only files with swim times */
  const resultFiles = new Map<string, Cup>()
  /** one cup per cup id (the same file can be in several folders), grouped by year */
  const years = new Map<number, Cup[]>()
  let cups: Cup[]

  beforeAll(async () => {
    for (const f of lxfFiles) {
      const cup = await loadCupFile(readFileSync(f), basename(f))
      if (!cup.entries.some((e) => Object.values(e.results).some((r) => r && r.time > 0))) continue
      resultFiles.set(f, cup)
      const list = years.get(cup.year) ?? []
      if (!list.some((c) => c.id === cup.id)) list.push(cup)
      years.set(cup.year, list)
    }
    cups = years.get(Math.max(...years.keys()))!
  })

  it('finds result files', () => {
    expect(resultFiles.size).toBeGreaterThan(0)
    for (const list of years.values()) expect(list.every((c) => c.entries.length > 0)).toBe(true)
  })

  // the SPLASH exports contain the official Mehrkampf result of each swimmer of that cup
  for (const csv of csvFiles) {
    it(`matches the Meet Manager Mehrkampf totals of ${relative(DIR, csv)}`, () => {
      const candidates = [...resultFiles].filter(([f]) => cupFolder(f) === cupFolder(csv))
      const sameName = candidates.find(([f]) => basename(f).replace(/\.lxf$/i, '') === basename(csv).replace(/\.(csv|txt)$/i, ''))
      const [, c] = sameName ?? (candidates.length === 1 ? candidates[0] : [])
      expect(c, 'no result file for this export').toBeDefined()
      const { totals, withoutTotal } = readCsvTotals(csv)
      let compared = 0
      for (const e of c!.entries) {
        const key = `${normalizeName(`${e.lastname} ${e.firstname}`)}|${e.birthdate}`
        const category = categoryForAge(c!.year - e.birthYear)
        const got = scoreEntry(e, category)
        // started but without Mehrkampf total in SPLASH (1–2 valid times, withdrawn): does not count
        if (withoutTotal.has(key)) expect(got.kind, `entry ${e.key}`).not.toBe('ok')
        const want = totals.get(key)
        if (!want) continue
        expect(category, `entry ${e.key}`).toBe(want.category)
        expect(got.kind === 'ok' ? formatTime(got.total) : got.kind, `entry ${e.key}`).toBe(want.time)
        compared++
      }
      // an export made at another time than the .lxf can differ in a few personal details
      expect(compared).toBeGreaterThanOrEqual(Math.max(1, totals.size - 2))
    })
  }

  // the published Rangliste PDFs: total, counted strokes and DSQ marks of every Mehrkampf row
  for (const pdf of rankingPdfs) {
    it.skipIf(!hasPdftotext())(`matches the published Mehrkampf ranking ${relative(DIR, pdf)}`, () => {
      const { city, date, rows } = rankingPdf(pdf)
      const cup = [...years.values()].flat().find((c) => normalizeName(c.city) === normalizeName(city) && c.date === date)
      if (!cup || isSuperseded(pdf)) return // no result file for this cup, or a preliminary ranking
      expect(rows.length).toBeGreaterThan(20)
      let matched = 0
      for (const r of rows) {
        const found = cup.entries.filter(
          (e) =>
            normalizeName(e.lastname) === normalizeName(r.last) &&
            String(e.birthYear).slice(2) === r.yy &&
            normalizeName(e.firstname).startsWith(normalizeName(r.first)),
        )
        if (found.length !== 1) continue
        const e = found[0]
        matched++
        const category = categoryForAge(cup.year - e.birthYear)
        const got = scoreEntry(e, category)
        const dsq = sorted(STROKES.filter((s) => e.results[s]?.status === 'DSQ'))
        expect(category, `entry ${e.key}`).toBe(r.category)
        expect(dsq, `DSQ of entry ${e.key}`).toEqual(sorted(STROKES.filter((s) => r.cells[s]?.dsq)))
        if (r.strokes >= (r.category === 'V' || r.category === 'IV' ? 3 : 4)) {
          expect(got.kind === 'ok' ? formatTime(got.total) : got.kind, `entry ${e.key}`).toBe(r.total)
          const counted = got.kind === 'ok' ? got.counted : []
          expect(sorted(counted), `counted strokes of entry ${e.key}`).toEqual(sorted(STROKES.filter((s) => r.cells[s]?.counted)))
          expect(counted.length).toBe(r.strokes)
        } else {
          // incomplete Mehrkampf: no rank, SPLASH prints the partial sum including DSQ penalties
          expect(got.kind, `entry ${e.key}`).not.toBe('ok')
          const valid = STROKES.filter((s) => isValidResult(e.results[s]))
          expect(formatTime(valid.reduce((sum, s) => sum + effectiveTime(e.results[s]!), 0)), `entry ${e.key}`).toBe(r.total)
        }
      }
      // abbreviated first names can make a few rows ambiguous
      expect(matched).toBeGreaterThanOrEqual(rows.length - 2)
    })
  }

  it('marks a swimmer as absent from a cup only if no look-alike entry of that cup is left unreported', () => {
    let checked = 0
    for (const list of years.values()) {
      const corrections = emptyCorrections()
      const persons = buildPersons(list, corrections)
      const personOf = new Map(persons.flatMap((p) => p.entries.map((e) => [e.key, p])))
      const reported = new Set(findIssues(persons, corrections).filter((i) => i.persons.length === 2).map((i) => i.persons.map((p) => p.id).sort().join('|')))
      for (const p of persons) {
        const name = normalizeName(`${p.lastname} ${p.firstname}`)
        const swapped = normalizeName(`${p.firstname} ${p.lastname}`)
        for (const cup of list) {
          if (p.entries.some((e) => e.cupId === cup.id)) continue
          checked++
          const lookAlikes = cup.entries.filter((e: Entry) => {
            const other = normalizeName(`${e.lastname} ${e.firstname}`)
            return e.gender === p.gender && Math.abs(e.birthYear - p.birthYear) <= 1 && (similarity(name, other) >= 0.8 || other === swapped)
          })
          for (const e of lookAlikes) {
            const q = personOf.get(e.key)!
            // persons who swam the same cup are different swimmers by definition
            if (sharesCup(p, q)) continue
            expect(reported.has([p.id, q.id].sort().join('|')), `${e.key} looks like person ${p.id} but is not reported`).toBe(true)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('builds persons and a ranking for every year, never merging two entries of one cup', () => {
    for (const list of years.values()) {
      const corrections = emptyCorrections()
      const persons = buildPersons(list, corrections)
      expect(persons.every((p) => new Set(p.entries.map((e) => e.cupId)).size === p.entries.length)).toBe(true)
      expect(computeRanking(list, persons, corrections.settings).groups).toHaveLength(10)
    }
  })

  it('maps nearly every swimmer to one of the six clubs', () => {
    const names = new Set(CLUBS.map((c) => c.name))
    for (const list of years.values()) {
      const persons = buildPersons(list, emptyCorrections())
      const known = persons.filter((p) => names.has(p.clubName)).length
      // a few starts registered under the Startgemeinschaft itself remain
      expect(known / persons.length).toBeGreaterThan(0.97)
    }
  })

  it('finds the known nickname case of the archive with the birthdate rule', () => {
    const found = [...years.values()].some((list) => {
      const corrections = emptyCorrections()
      return findIssues(buildPersons(list, corrections), corrections).some((i) => i.type === 'birthdate')
    })
    expect(found).toBe(true)
  })

  // the following tests use the latest year (cups)
  it('reports only the known similar-name cases of the latest year', () => {
    const corrections = emptyCorrections()
    const issues = findIssues(buildPersons(cups, corrections), corrections)
    expect(issues.map((i) => i.type)).toEqual(['similar', 'similar', 'similar'])
  })

  it('auto-matches placeholder birthdates, accent variants and differing club codes', () => {
    const persons = buildPersons(cups, emptyCorrections())
    const distinct = (p: (typeof persons)[number], f: (e: (typeof persons)[number]['entries'][number]) => string) =>
      new Set(p.entries.map(f)).size
    expect(persons.some((p) => distinct(p, (e) => e.birthdate) > 1)).toBe(true)
    expect(persons.some((p) => distinct(p, (e) => e.lastname) > 1)).toBe(true)
    expect(persons.some((p) => distinct(p, (e) => e.clubCode) > 1)).toBe(true)
    // auto-matching never merges two entries of the same cup
    expect(persons.every((p) => distinct(p, (e) => e.cupId) === p.entries.length)).toBe(true)
  })

  it('produces an interim ranking with eligible swimmers', () => {
    const corrections = emptyCorrections()
    const ranking = computeRanking(cups, buildPersons(cups, corrections), corrections.settings)
    expect(ranking.final).toBe(false)
    expect(ranking.groups.reduce((n, g) => n + g.ranked.length, 0)).toBeGreaterThan(20)
  })
})
