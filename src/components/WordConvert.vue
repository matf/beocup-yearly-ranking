<script setup lang="ts">
import { computed, ref } from 'vue'
import { addGeneratedEntries, entryPersons, notify, state } from '../store'
import { loadLenexFile, parseLenexFile } from '../core/lenex'
import { parseEntryTime, parseWordForm, prepareSwimmers, readWordText, type FormSwimmer } from '../core/wordform'
import { buildEntryLenex, zipLenex } from '../core/lenexWriter'
import { CLUBS } from '../core/clubs'
import { STROKE_LABELS, formatDate, formatTime } from '../core/format'
import type { Gender, MeetTemplate, Stroke } from '../core/types'
import { STROKES } from '../core/types'

/** Gstaad enters its swimmers with a Word form; they start for Schulsport Saanenland. */
const CLUB = { code: 'SAAN', name: CLUBS.find((c) => c.codes.includes('SAAN'))!.name }

interface Row extends FormSwimmer {
  /** the time cells as typed */
  texts: Record<Stroke, string>
  /** the operator confirmed the questions of this row */
  confirmed: boolean
  /** problems of the row structure (e.g. too many times); cleared once a time is edited */
  structural: string[]
}

const meet = ref<MeetTemplate | null>(null)
const formName = ref('')
const formTitle = ref('')
const rows = ref<Row[]>([])
const ignored = ref<string[]>([])

async function onAnnouncement(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const lenex = await loadLenexFile(await file.arrayBuffer(), file.name)
    if (lenex.kind !== 'announcement') {
      notify('error', `${file.name}: keine Ausschreibung (${lenex.kind === 'entries' ? 'Meldedatei' : 'Resultate'}).`)
      return
    }
    meet.value = lenex.meet
  } catch (err) {
    notify('error', `${file.name}: ${(err as Error).message}`)
  }
}

async function onForm(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const form = parseWordForm(await readWordText(await file.arrayBuffer()))
    if (!form.rows.length) {
      notify('error', `${file.name}: keine Schwimmer:innen-Zeilen gefunden (Name, Jahrgang, 4 Zeiten).`)
      return
    }
    formName.value = file.name
    formTitle.value = form.title
    ignored.value = form.ignored
    rows.value = prepareSwimmers(form.rows, entryPersons.value).map((s) => ({
      ...s,
      // unreadable times, the year and the name are re-checked live while editing
      structural: s.errors.filter((x) => !/^(Zeit|Jahrgang|Nachname)/.test(x)),
      confirmed: false,
      texts: Object.fromEntries(STROKES.map((st) => [st, s.times[st] ? formatTime(s.times[st]!) : ''])) as Record<Stroke, string>,
    }))
  } catch (err) {
    notify('error', `${file.name}: ${(err as Error).message}`)
  }
}

function setTime(row: Row, stroke: Stroke, text: string) {
  row.texts[stroke] = text
  row.structural = []
  const { time } = parseEntryTime(text)
  if (time === null) delete row.times[stroke]
  else row.times[stroke] = time
}

function setYear(row: Row, value: string) {
  const year = Number(value)
  if (!(year > 1900)) return
  row.birthYear = year
  if (!row.birthdate.startsWith(`${year}-`)) row.birthdate = `${year}-01-01`
}

const timeError = (row: Row, stroke: Stroke) => parseEntryTime(row.texts[stroke]).error
/** what must be fixed before the download: nothing is filled in by guessing */
const rowErrors = (row: Row) => [
  ...(row.gender ? [] : ['Geschlecht fehlt: bitte wählen']),
  ...(row.birthYear ? [] : ['Jahrgang fehlt: bitte eintragen']),
  ...STROKES.map((st) => timeError(row, st)).filter((x): x is string => !!x),
  ...(STROKES.some((st) => row.times[st]) ? [] : ['Keine Zeit gemeldet']),
  ...(row.lastname.trim() && row.firstname.trim() ? [] : ['Name unvollständig']),
  ...row.structural,
]
const problems = computed(() => rows.value.filter((r) => rowErrors(r).length).length)
const openQuestions = computed(() => rows.value.filter((r) => r.questions.length && !r.confirmed).length)
const ready = computed(() => !!meet.value && rows.value.length > 0 && problems.value === 0 && openQuestions.value === 0)
const fileBase = computed(() => (meet.value ? `Meldung ${CLUB.code} ${meet.value.name || meet.value.city}` : ''))

function removeRow(row: Row) {
  rows.value = rows.value.filter((r) => r !== row)
}

async function download() {
  if (!meet.value || !ready.value) return
  try {
    const created = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19)
    const swimmers = rows.value.map((r) => ({ ...r, lastname: r.lastname.trim(), firstname: r.firstname.trim(), gender: r.gender as Gender }))
    const xml = buildEntryLenex(meet.value, CLUB, swimmers, created)
    const bytes = await zipLenex(xml, fileBase.value)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }))
    a.download = `${fileBase.value}.lxf`
    a.click()
    URL.revokeObjectURL(a.href)
    const parsed = parseLenexFile(xml, `${fileBase.value}.lxf`)
    if (parsed.kind === 'entries') addGeneratedEntries(parsed.entries)
    notify('info', `${fileBase.value}.lxf erstellt (${swimmers.length} Schwimmer:innen) und zur Prüfung hinzugefügt.`)
  } catch (err) {
    notify('error', (err as Error).message)
  }
}
</script>

<template>
  <section class="card no-print">
    <h2>Word-Meldung umwandeln</h2>
    <p class="muted">
      Gstaad meldet mit einem Word-Formular. Hier wird daraus eine LENEX-Meldedatei für den Import in den Meet Manager
      (Verein {{ CLUB.name }}). Zuerst die Ausschreibung des Cups (.lxf) laden: sie liefert Veranstaltung und Wettkämpfe.
      Geschlecht und Geburtsdatum stehen nicht im Formular und werden aus den Vergleichs-Resultaten übernommen
      ({{ state.entries.cups.length }} geladen).
    </p>

    <div class="steps">
      <label class="step">
        <input type="file" accept=".lxf,.lef,.xml" hidden @change="onAnnouncement" />
        <span class="num">1</span>
        <span>
          <strong>Ausschreibung (.lxf)</strong><br />
          <span v-if="meet">{{ meet.name }} · {{ meet.city }} · {{ formatDate(meet.date) }}</span>
          <span v-else class="muted">klicken zum Auswählen</span>
        </span>
      </label>
      <label class="step">
        <input type="file" accept=".doc,.docx" hidden @change="onForm" />
        <span class="num">2</span>
        <span>
          <strong>Word-Meldung (.doc/.docx)</strong><br />
          <span v-if="formName">{{ formName }} · {{ rows.length }} Schwimmer:innen</span>
          <span v-else class="muted">klicken zum Auswählen</span>
        </span>
      </label>
    </div>

    <template v-if="rows.length">
      <p v-if="formTitle" class="muted">Titel im Formular: «{{ formTitle }}» – Staffeln werden nicht übernommen.</p>
      <div class="table-scroll">
        <table class="convert">
          <thead>
            <tr>
              <th>#</th><th>Nachname</th><th>Vorname</th><th>Jg.</th><th>G</th>
              <th v-for="s in STROKES" :key="s">{{ STROKE_LABELS[s] }}</th>
              <th>Hinweise</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.row">
              <td class="muted">{{ r.row }}</td>
              <td><input v-model="r.lastname" class="name" /></td>
              <td><input v-model="r.firstname" class="name" /></td>
              <td><input :value="r.birthYear || ''" class="year" :class="{ invalid: !r.birthYear }" inputmode="numeric" @change="setYear(r, ($event.target as HTMLInputElement).value)" /></td>
              <td>
                <select v-model="r.gender" :class="{ invalid: !r.gender }">
                  <option value="">–</option>
                  <option value="F">F</option>
                  <option value="M">M</option>
                </select>
              </td>
              <td v-for="s in STROKES" :key="s">
                <input
                  :value="r.texts[s]"
                  class="time"
                  :class="{ invalid: timeError(r, s) }"
                  :title="timeError(r, s)"
                  placeholder="–"
                  @change="setTime(r, s, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="notes">
                <div v-for="(e, i) in rowErrors(r)" :key="'e' + i" class="error">{{ e }}</div>
                <template v-if="r.questions.length">
                  <div v-for="(q, i) in r.questions" :key="'q' + i" class="warning">{{ q }}</div>
                  <label class="confirm"><input v-model="r.confirmed" type="checkbox" /> geprüft, stimmt so</label>
                </template>
                <div v-for="(n, i) in r.info" :key="'i' + i" class="muted">{{ n }}</div>
                <div v-if="r.birthdate.endsWith('-01-01')" class="muted">Geburtsdatum: nur Jahrgang bekannt</div>
              </td>
              <td><button class="link danger" @click="removeRow(r)">Entfernen</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <details v-if="ignored.length" class="ignored">
        <summary>{{ ignored.length }} Zeilen nicht übernommen (Titel, Kopfzeile, Staffeln …) – prüfen, ob niemand fehlt</summary>
        <ul><li v-for="(l, i) in ignored" :key="i">{{ l }}</li></ul>
      </details>
      <div class="row">
        <span v-if="!meet" class="badge error">Ausschreibung fehlt</span>
        <span v-if="problems" class="badge error">{{ problems }} Zeilen mit Fehlern</span>
        <span v-if="openQuestions" class="badge warn">{{ openQuestions }} Rückfragen offen</span>
        <span class="spacer" />
        <button :disabled="!ready" @click="download">Lenex herunterladen und prüfen</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.steps { display: flex; flex-wrap: wrap; gap: .75rem; margin: .5rem 0 1rem; }
.step {
  display: flex; gap: .75rem; align-items: center; flex: 1 1 260px;
  padding: .75rem 1rem; border: 2px dashed var(--border); border-radius: var(--radius); cursor: pointer;
}
.step:hover { border-color: var(--accent); background: var(--accent-soft); }
.step .num {
  display: inline-grid; place-items: center; width: 1.6rem; height: 1.6rem; flex: none;
  border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: bold;
}
.convert input { padding: .2rem .35rem; }
.convert .name { width: 9rem; }
.convert .year { width: 3.6rem; }
.convert .time { width: 4.6rem; text-align: right; }
.invalid { border-color: var(--error); background: var(--error-soft); }
.notes { font-size: .85rem; min-width: 12rem; }
.notes .error { color: var(--error); }
.notes .warning { color: var(--warn); }
.confirm { display: flex; gap: .3rem; align-items: center; color: var(--warn); font-weight: bold; }
.ignored { margin: .75rem 0; font-size: .9rem; }
.ignored ul { margin: .4rem 0; color: var(--muted); }
</style>
