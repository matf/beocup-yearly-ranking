import { computed, reactive, watch } from 'vue'
import type { Corrections, Cup, EntryFile } from './core/types'
import { loadCupFile, loadLenexFile } from './core/lenex'
import { activeEntries, checkEntries } from './core/entries'
import { buildPersons } from './core/matching'
import { findIssues } from './core/issues'
import { computeRanking } from './core/scoring'
import { emptyCorrections, parseCorrections } from './core/corrections'

const CUPS_KEY = 'beocup.cups.v1'
const CORRECTIONS_KEY = 'beocup.corrections.v1'
const ENTRIES_KEY = 'beocup.entries.v1'

/** Meldungen tab: entry files and comparison results of any year, separate from the ranking */
interface EntriesState {
  files: EntryFile[]
  cups: Cup[]
}

function load<T>(key: string, fallback: T, parse: (s: string) => T = JSON.parse): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked – the app keeps working, the operator can still export
  }
}

export const state = reactive({
  cups: load<Cup[]>(CUPS_KEY, []),
  corrections: load<Corrections>(CORRECTIONS_KEY, emptyCorrections(), parseCorrections),
  entries: load<EntriesState>(ENTRIES_KEY, { files: [], cups: [] }),
  messages: [] as { kind: 'error' | 'info'; text: string }[],
})

watch(() => state.cups, (v) => save(CUPS_KEY, v), { deep: true })
watch(() => state.corrections, (v) => save(CORRECTIONS_KEY, v), { deep: true })
watch(() => state.entries, (v) => save(ENTRIES_KEY, v), { deep: true })

export const persons = computed(() => buildPersons(state.cups, state.corrections))
export const issues = computed(() => findIssues(persons.value, state.corrections))
export const ranking = computed(() => computeRanking(state.cups, persons.value, state.corrections.settings))
export const cupsByDate = computed(() => [...state.cups].sort((a, b) => a.date.localeCompare(b.date)))

// corrections are keyed by entry keys, so they also apply to the same cup loaded as comparison result
export const entryPersons = computed(() => buildPersons(state.entries.cups, state.corrections))
export const entryChecks = computed(() => checkEntries(state.entries.files, state.entries.cups, entryPersons.value))
export const replacedEntryFiles = computed(() => activeEntries(state.entries.files).replaced)
export const entryProblemCount = computed(() =>
  entryChecks.value.reduce((n, m) => n + m.checks.filter((c) => c.findings.some((f) => f.severity !== 'info')).length, 0),
)

export function notify(kind: 'error' | 'info', text: string) {
  state.messages.push({ kind, text })
  setTimeout(() => state.messages.shift(), kind === 'error' ? 8000 : 4000)
}

/** Applies an operator decision; all views recompute from the new corrections. */
export function updateCorrections(change: (c: Corrections) => Corrections) {
  state.corrections = change(state.corrections)
}

export async function addFiles(files: Iterable<File>) {
  // copy synchronously: a FileList is live and emptied when the input is reset
  for (const file of Array.from(files)) {
    try {
      const cup = await loadCupFile(await file.arrayBuffer(), file.name)
      const years = new Set(state.cups.map((c) => c.year))
      if (years.size && !years.has(cup.year)) {
        notify('error', `${file.name}: Cup von ${cup.year}, die geladenen Cups sind von ${[...years].join(', ')}.`)
        continue
      }
      const existing = state.cups.findIndex((c) => c.id === cup.id)
      if (existing >= 0) state.cups.splice(existing, 1, cup)
      else state.cups.push(cup)
      notify('info', `${cup.name} (${cup.city}) geladen: ${cup.entries.length} Schwimmer:innen.`)
    } catch (e) {
      notify('error', `${file.name}: ${(e as Error).message}`)
    }
  }
}

export function removeCup(id: string) {
  state.cups = state.cups.filter((c) => c.id !== id)
}

export async function importCorrections(file: File) {
  try {
    state.corrections = parseCorrections(await file.text())
    notify('info', 'Korrekturen geladen.')
  } catch (e) {
    notify('error', (e as Error).message)
  }
}

export function exportCorrections() {
  const year = ranking.value.year || new Date().getFullYear()
  const blob = new Blob([JSON.stringify(state.corrections, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `beocup-korrekturen-${year}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function resetCorrections() {
  state.corrections = { ...emptyCorrections(), settings: state.corrections.settings }
}

/** Meldungen tab: entry files are checked, result files of any year become comparison data. */
export async function addEntryFiles(files: Iterable<File>) {
  for (const file of Array.from(files)) {
    if (/\.docx?$/i.test(file.name)) {
      notify('error', `${file.name}: Word-Meldungen im Bereich «Word-Meldung umwandeln» laden.`)
      continue
    }
    try {
      const lenex = await loadLenexFile(await file.arrayBuffer(), file.name, new Date(file.lastModified).toISOString().slice(0, 19))
      if (lenex.kind === 'announcement') {
        notify('error', `${file.name}: Ausschreibung – nur als Vorlage im Bereich «Word-Meldung umwandeln» verwendbar.`)
      } else if (lenex.kind === 'entries') {
        const f = lenex.entries
        const list = state.entries.files.filter((x) => x.id !== f.id)
        state.entries.files = [...list, f]
        notify('info', `${f.fileName}: ${f.swimmers.length} gemeldete Schwimmer:innen für ${f.meetName}.`)
      } else {
        const cup = lenex.cup
        state.entries.cups = [...state.entries.cups.filter((c) => c.id !== cup.id), cup]
        notify('info', `${cup.name} (${cup.city}) als Vergleichs-Resultat geladen: ${cup.entries.length} Schwimmer:innen.`)
      }
    } catch (e) {
      notify('error', `${file.name}: ${(e as Error).message}`)
    }
  }
}

export function removeEntryFile(id: string) {
  state.entries.files = state.entries.files.filter((f) => f.id !== id)
}

export function removeComparisonCup(id: string) {
  state.entries.cups = state.entries.cups.filter((c) => c.id !== id)
}

/** Copies the cups of the yearly ranking into the comparison results. */
export function useRankingCups() {
  const ids = new Set(state.cups.map((c) => c.id))
  state.entries.cups = [...state.entries.cups.filter((c) => !ids.has(c.id)), ...state.cups]
}

export function clearEntries() {
  state.entries = { files: [], cups: [] }
}

/** Adds an entry file generated from a Word form to the checks (replaces one of the same name). */
export function addGeneratedEntries(file: EntryFile) {
  state.entries.files = [...state.entries.files.filter((x) => x.id !== file.id), file]
}
