/**
 * Runs against the real result files in results/ (not in git – personal data), including the
 * archive of past years. Skipped automatically when the folder is missing.
 *
 * Result files are found automatically: every .lxf below results/ that contains swim times
 * (entry and announcement files have none). Each SPLASH CSV export is compared with the
 * result file of the same cup folder (`YYYY-MM …`), or with the .lxf of the same name.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCupFile } from '../lenex'
import { buildPersons } from '../matching'
import { findIssues } from '../issues'
import { categoryForAge, computeRanking, scoreEntry } from '../scoring'
import { emptyCorrections } from '../corrections'
import { normalizeName } from '../normalize'
import { formatTime } from '../format'
import type { Cup } from '../types'

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
const csvFiles = files.filter((f) => f.toLowerCase().endsWith('.csv'))

/** The cup folder (`2025-05-25 Aeschi`, `2026-08 Thun`) a file belongs to, or its own folder. */
function cupFolder(path: string): string {
  for (let d = dirname(path); d.startsWith(DIR) && d !== DIR; d = dirname(d)) {
    if (/^\d{4}-\d{2}/.test(basename(d))) return d
  }
  return dirname(path)
}

/** Mehrkampf results from a SPLASH CSV export: "LAST, First" + birthdate → category and total. */
function readCsvTotals(path: string) {
  const text = new TextDecoder('latin1').decode(readFileSync(path))
  const rows = text.split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split('\t'))
  const totals = new Map<string, { category: string; time: string }>()
  for (const row of rows) {
    const idx = row.findIndex((c) => /^Kategorie (I|II|III|IV|V) /.test(c))
    if (idx < 0 || !row[idx + 1]) continue
    const [day, month, year] = row[1].split('.')
    totals.set(`${normalizeName(row[0].replace(',', ''))}|${year}-${month}-${day}`, {
      category: row[idx].split(' ')[1],
      time: row[idx + 1],
    })
  }
  return totals
}

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

  // the CSV exports contain the official Mehrkampf result of each swimmer of that cup
  for (const csv of csvFiles) {
    it(`matches the Meet Manager Mehrkampf totals of ${relative(DIR, csv)}`, () => {
      const candidates = [...resultFiles].filter(([f]) => cupFolder(f) === cupFolder(csv))
      const sameName = candidates.find(([f]) => basename(f, '.lxf') === basename(csv, '.csv'))
      const [, c] = sameName ?? (candidates.length === 1 ? candidates[0] : [])
      expect(c, 'no result file for this CSV').toBeDefined()
      const expected = readCsvTotals(csv)
      let compared = 0
      for (const e of c!.entries) {
        const want = expected.get(`${normalizeName(`${e.lastname} ${e.firstname}`)}|${e.birthdate}`)
        if (!want) continue
        const category = categoryForAge(c!.year - e.birthYear)
        const got = scoreEntry(e, category)
        expect(category, `${e.lastname} ${e.firstname}`).toBe(want.category)
        expect(got.kind === 'ok' ? formatTime(got.total) : got.kind, `${e.lastname} ${e.firstname}`).toBe(want.time)
        compared++
      }
      // a CSV exported at another time than the .lxf can differ in a few personal details
      expect(compared).toBeGreaterThanOrEqual(Math.max(1, expected.size - 2))
    })
  }

  it('builds persons and a ranking for every year, never merging two entries of one cup', () => {
    for (const list of years.values()) {
      const corrections = emptyCorrections()
      const persons = buildPersons(list, corrections)
      expect(persons.every((p) => new Set(p.entries.map((e) => e.cupId)).size === p.entries.length)).toBe(true)
      expect(computeRanking(list, persons, corrections.settings).groups).toHaveLength(10)
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
