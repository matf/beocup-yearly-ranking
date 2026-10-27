<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  addEntryFiles, clearEntries, entryChecks, removeComparisonCup, removeEntryFile, replacedEntryFiles, state, useRankingCups,
} from '../store'
import { STROKE_LABELS, formatDate } from '../core/format'
import { normalizeName } from '../core/normalize'
import { clubName } from '../core/clubs'
import type { EntryCheck, MeetCheck } from '../core/entries'
import type { EntryFile } from '../core/types'
import { STROKES } from '../core/types'

const dragging = ref(false)
const confirmClear = ref(false)
const filter = ref<'all' | 'problems' | 'errors'>('problems')
const query = ref('')

function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files) addEntryFiles(e.dataTransfer.files)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addEntryFiles(input.files)
  input.value = ''
}

function clear() {
  if (!confirmClear.value) {
    confirmClear.value = true
    setTimeout(() => (confirmClear.value = false), 4000)
    return
  }
  clearEntries()
  confirmClear.value = false
}

const files = computed(() =>
  [...state.entries.files].sort((a, b) => b.date.localeCompare(a.date) || a.fileName.localeCompare(b.fileName)),
)
const comparisonCups = computed(() => [...state.entries.cups].sort((a, b) => b.date.localeCompare(a.date)))

const clubsOf = (f: EntryFile) => [...new Set(f.swimmers.map((s) => clubName(s.clubCode, s.clubName)))].join(', ')
const replacedBy = (f: EntryFile) => replacedEntryFiles.value.filter((r) => r.file === f)
const formatCreated = (iso: string) => (iso ? `${formatDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '–')

function visible(checks: EntryCheck[]): EntryCheck[] {
  const q = normalizeName(query.value)
  return checks.filter((c) => {
    const s = c.swimmer
    if (q && !normalizeName(`${s.lastname} ${s.firstname} ${s.firstname} ${s.lastname} ${c.club}`).includes(q)) return false
    if (filter.value === 'errors') return c.findings.some((f) => f.severity === 'error')
    if (filter.value === 'problems') return c.findings.some((f) => f.severity !== 'info')
    return true
  })
}

/** visible checks grouped by club */
function byClub(meet: MeetCheck): [string, EntryCheck[]][] {
  const groups = new Map<string, EntryCheck[]>()
  for (const c of visible(meet.checks)) groups.set(c.club, [...(groups.get(c.club) ?? []), c])
  return [...groups]
}

const count = (meet: MeetCheck, severity: 'error' | 'warning') =>
  meet.checks.filter((c) => c.findings.some((f) => f.severity === severity)).length

function print() {
  window.print()
}
</script>

<template>
  <section class="card no-print">
    <h2>Meldungen prüfen</h2>
    <p class="muted">
      Unabhängig von der Jahreswertung. Meldedateien der Vereine (SPLASH Team Manager) werden geprüft gegen die
      Vergleichs-Resultate: Resultat-Dateien beliebiger Jahre, hier geladen oder aus der Jahreswertung übernommen.
      Pro Cup und Verein zählt nur die neueste Meldedatei.
    </p>
    <label
      class="drop"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <input type="file" accept=".lxf,.lef,.xml" multiple hidden @change="onPick" />
      <strong>Meldungen und Resultate (.lxf) hierher ziehen</strong>
      <span class="muted">oder klicken zum Auswählen – der Dateityp wird erkannt</span>
    </label>

    <h3>Meldedateien</h3>
    <div v-if="files.length" class="table-scroll">
      <table>
        <thead>
          <tr><th>Cup</th><th>Verein</th><th class="num">Gemeldet</th><th>Erstellt</th><th>Datei</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="f in files" :key="f.id" :class="{ replaced: replacedBy(f).length }">
            <td>{{ f.city }} {{ formatDate(f.date) }}</td>
            <td>{{ clubsOf(f) }}</td>
            <td class="num">{{ f.swimmers.length }}</td>
            <td>{{ formatCreated(f.created) }}</td>
            <td class="muted">{{ f.fileName }}</td>
            <td>
              <span v-if="!replacedBy(f).length" class="badge ok">aktiv</span>
              <span v-for="r in replacedBy(f)" :key="r.club" class="badge">ersetzt durch {{ r.by.fileName }}</span>
            </td>
            <td><button class="link danger" @click="removeEntryFile(f.id)">Entfernen</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">Noch keine Meldungen geladen.</p>

    <h3>Vergleichs-Resultate</h3>
    <div v-if="comparisonCups.length" class="table-scroll">
      <table>
        <thead>
          <tr><th>Datum</th><th>Ort</th><th>Veranstaltung</th><th class="num">Schwimmer:innen</th><th>Datei</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="c in comparisonCups" :key="c.id">
            <td>{{ formatDate(c.date) }}</td>
            <td>{{ c.city }}</td>
            <td>{{ c.name }}</td>
            <td class="num">{{ c.entries.length }}</td>
            <td class="muted">{{ c.fileName }}</td>
            <td><button class="link danger" @click="removeComparisonCup(c.id)">Entfernen</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">Noch keine Vergleichs-Resultate: ohne sie werden nur die Disziplinen geprüft.</p>

    <div class="row">
      <button :disabled="!state.cups.length" @click="useRankingCups">
        Cups der Jahreswertung übernehmen ({{ state.cups.length }})
      </button>
      <span class="spacer" />
      <button class="danger" :disabled="!files.length && !comparisonCups.length" @click="clear">
        {{ confirmClear ? 'Wirklich alle Meldungen und Vergleichs-Resultate entfernen?' : 'Alle entfernen' }}
      </button>
    </div>
  </section>

  <template v-if="entryChecks.length">
    <div class="row toolbar no-print">
      <span class="spacer" />
      <input v-model="query" type="search" placeholder="Name oder Verein suchen …" />
      <select v-model="filter">
        <option value="problems">Nur Fehler und Warnungen</option>
        <option value="errors">Nur Fehler</option>
        <option value="all">Alle</option>
      </select>
      <button @click="print">Drucken</button>
    </div>

    <section v-for="meet in entryChecks" :key="meet.meetId" class="card meet">
      <h2>
        Meldungen {{ meet.meetName }} · {{ formatDate(meet.date) }}
        <span class="counts">
          <span class="muted">{{ meet.checks.length }} gemeldet</span>
          <span v-if="count(meet, 'error')" class="badge error">{{ count(meet, 'error') }} mit Fehlern</span>
          <span v-if="count(meet, 'warning')" class="badge warn">{{ count(meet, 'warning') }} mit Warnungen</span>
        </span>
      </h2>
      <div class="table-scroll">
        <table class="entries">
          <thead>
            <tr>
              <th>Name</th><th>Jg.</th><th>G</th><th>Kat.</th>
              <th v-for="s in STROKES" :key="s" class="stroke">{{ STROKE_LABELS[s].slice(0, 2) }}</th>
              <th>Befund</th>
            </tr>
          </thead>
          <tbody v-for="[club, checks] in byClub(meet)" :key="club">
            <tr class="club"><th colspan="9">{{ club }}</th></tr>
            <tr v-for="c in checks" :key="c.file.id + c.swimmer.athleteId">
              <td>{{ c.swimmer.lastname }} {{ c.swimmer.firstname }}</td>
              <td>{{ c.swimmer.birthYear }}</td>
              <td>{{ c.swimmer.gender }}</td>
              <td>{{ c.category }}</td>
              <td v-for="s in STROKES" :key="s" class="stroke">
                <span v-if="c.swimmer.strokes.includes(s)">✓</span>
                <span v-else-if="s === 'FLY' && (c.category === 'V' || c.category === 'IV')" class="muted">·</span>
                <span v-else class="missing">–</span>
              </td>
              <td class="findings">
                <div v-for="(f, i) in c.findings" :key="i" :class="f.severity">{{ f.text }}</div>
                <span v-if="!c.findings.length" class="ok">in Ordnung</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!visible(meet.checks).length" class="muted">Keine Einträge für diesen Filter.</p>
    </section>
  </template>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .25rem;
  padding: 1.5rem;
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 1rem;
  text-align: center;
}
.drop:hover, .drop.dragging { border-color: var(--accent); background: var(--accent-soft); }
h3 { margin: 1rem 0 .4rem; font-size: 1rem; }
tr.replaced td { color: var(--muted); }
.toolbar { margin-bottom: .5rem; }
.meet h2 { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: baseline; }
.counts { display: flex; gap: .5rem; font-size: .85rem; font-weight: normal; }
.entries tr.club th { text-align: left; background: var(--bg); padding-top: .5rem; }
.stroke { text-align: center; width: 2.2rem; }
.missing { color: var(--error); font-weight: bold; }
.findings div + div { margin-top: .15rem; }
.findings .error { color: var(--error); }
.findings .warning { color: var(--warn); }
.findings .info, .findings .ok { color: var(--muted); }
@media print {
  .meet { break-inside: auto; border: none; padding: 0; }
  .entries { font-size: 8.5pt; }
  .entries tbody { break-inside: avoid; }
}
</style>
