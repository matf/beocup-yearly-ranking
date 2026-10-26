/**
 * Runs against the real result files in results/ (not in git – personal data).
 * Skipped automatically when the folder is missing.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.lxf')) : []

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

describe.skipIf(files.length === 0)('real 2026 results', () => {
  let cups: Cup[]
  beforeAll(async () => {
    cups = await Promise.all(files.map((f) => loadCupFile(readFileSync(join(DIR, f)), f)))
  })

  it('loads all cups of 2026 with their entries', () => {
    expect(cups.every((c) => c.year === 2026)).toBe(true)
    expect(cups.every((c) => c.entries.length > 50)).toBe(true)
  })

  // the CSV exports contain the official Mehrkampf result of each swimmer of that cup
  for (const csv of existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.csv')) : []) {
    it(`matches the Meet Manager Mehrkampf totals of ${csv}`, () => {
      const lxf = csv.replace(/\.csv$/, '.lxf')
      const c = cups.find((x) => x.fileName === lxf)!
      const expected = readCsvTotals(join(DIR, csv))
      expect(expected.size).toBeGreaterThan(30)
      let compared = 0
      for (const e of c.entries) {
        const want = expected.get(`${normalizeName(`${e.lastname} ${e.firstname}`)}|${e.birthdate}`)
        if (!want) continue
        const category = categoryForAge(c.year - e.birthYear)
        const got = scoreEntry(e, category)
        expect(category, `${e.lastname} ${e.firstname}`).toBe(want.category)
        expect(got.kind === 'ok' ? formatTime(got.total) : got.kind, `${e.lastname} ${e.firstname}`).toBe(want.time)
        compared++
      }
      expect(compared).toBe(expected.size)
    })
  }

  it('reports the known suspicious entries', () => {
    const corrections = emptyCorrections()
    const issues = findIssues(buildPersons(cups, corrections), corrections)
    const names = issues.map((i) => i.persons.map((p) => `${p.lastname} ${p.firstname}`).sort().join(' + '))
    expect(names).toContain('Gerber Tim + Gerber Timm')
    expect(names).toContain('De Vries Annelies + Vries Anneliese')
    expect(names).toContain('Ammann Florian + Ammann Florian Matteo')
    expect(names.some((n) => n.includes('Zbinden Jolanda') && n.includes('Zbinden Selina'))).toBe(false)
  })

  it('auto-matches placeholder birthdates, accents and club codes', () => {
    const persons = buildPersons(cups, emptyCorrections())
    const find = (last: string, first: string) =>
      persons.filter((p) => normalizeName(p.lastname) === last && normalizeName(p.firstname) === first)
    expect(find('hofstetter', 'simon')).toHaveLength(1)
    expect(find('hofstetter', 'simon')[0].entries).toHaveLength(4)
    expect(find('novak', 'jan')).toHaveLength(1)
  })

  it('produces an interim ranking with eligible swimmers', () => {
    const corrections = emptyCorrections()
    const ranking = computeRanking(cups, buildPersons(cups, corrections), corrections.settings)
    expect(ranking.final).toBe(false)
    expect(ranking.groups.reduce((n, g) => n + g.ranked.length, 0)).toBeGreaterThan(20)
  })
})
