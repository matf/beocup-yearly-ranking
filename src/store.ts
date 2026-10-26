import { computed, reactive, watch } from 'vue'
import type { Corrections, Cup } from './core/types'
import { loadCupFile } from './core/lenex'
import { buildPersons } from './core/matching'
import { findIssues } from './core/issues'
import { computeRanking } from './core/scoring'
import { emptyCorrections, parseCorrections } from './core/corrections'

const CUPS_KEY = 'beocup.cups.v1'
const CORRECTIONS_KEY = 'beocup.corrections.v1'

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
  messages: [] as { kind: 'error' | 'info'; text: string }[],
})

watch(() => state.cups, (v) => save(CUPS_KEY, v), { deep: true })
watch(() => state.corrections, (v) => save(CORRECTIONS_KEY, v), { deep: true })

export const persons = computed(() => buildPersons(state.cups, state.corrections))
export const issues = computed(() => findIssues(persons.value, state.corrections))
export const ranking = computed(() => computeRanking(state.cups, persons.value, state.corrections.settings))
export const cupsByDate = computed(() => [...state.cups].sort((a, b) => a.date.localeCompare(b.date)))

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
