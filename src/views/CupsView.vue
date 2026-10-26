<script setup lang="ts">
import { ref } from 'vue'
import { addFiles, cupsByDate, exportCorrections, importCorrections, issues, removeCup, resetCorrections, state, updateCorrections } from '../store'
import { formatDate } from '../core/format'

defineEmits<{ goto: [tab: 'issues'] }>()

const dragging = ref(false)
const confirmReset = ref(false)

function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

function onPickCorrections(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) importCorrections(input.files[0])
  input.value = ''
}

function setCupsPerYear(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (n >= 1 && n <= 20) updateCorrections((c) => ({ ...c, settings: { ...c.settings, cupsPerYear: n } }))
}

function reset() {
  if (!confirmReset.value) {
    confirmReset.value = true
    setTimeout(() => (confirmReset.value = false), 4000)
    return
  }
  resetCorrections()
  confirmReset.value = false
}

const correctionCount = () =>
  state.corrections.merges.length + state.corrections.separations.length + Object.keys(state.corrections.overrides).length
</script>

<template>
  <section class="card">
    <h2>Resultat-Dateien</h2>
    <label
      class="drop"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <input type="file" accept=".lxf,.lef,.xml" multiple hidden @change="onPick" />
      <strong>LENEX-Dateien (.lxf) hierher ziehen</strong>
      <span class="muted">oder klicken zum Auswählen – Resultate-Export aus dem SPLASH Meet Manager</span>
    </label>

    <table v-if="cupsByDate.length" class="cups">
      <thead>
        <tr><th>#</th><th>Datum</th><th>Ort</th><th>Veranstaltung</th><th class="num">Schwimmer:innen</th><th>Datei</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="(cup, i) in cupsByDate" :key="cup.id">
          <td>{{ i + 1 }}</td>
          <td>{{ formatDate(cup.date) }}</td>
          <td>{{ cup.city }}</td>
          <td>{{ cup.name }}</td>
          <td class="num">{{ cup.entries.length }}</td>
          <td class="muted">{{ cup.fileName }}</td>
          <td><button class="link danger" @click="removeCup(cup.id)">Entfernen</button></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="muted">Noch keine Cups geladen.</p>

    <p v-if="issues.length" class="row">
      <span class="badge warn">{{ issues.length }} verdächtige Einträge</span>
      <button class="link" @click="$emit('goto', 'issues')">jetzt prüfen →</button>
    </p>
  </section>

  <section class="card">
    <h2>Einstellungen</h2>
    <label class="row">
      Anzahl Cups pro Jahr
      <input type="number" min="1" max="20" :value="state.corrections.settings.cupsPerYear" style="width: 5rem" @change="setCupsPerYear" />
    </label>
    <p class="muted">
      Solange weniger Cups geladen sind, ist die Rangliste ein Zwischenstand. Für die Wertung zählen nur
      Schwimmer:innen mit gültiger Gesamtzeit an allen geladenen Cups.
    </p>
  </section>

  <section class="card">
    <h2>Korrekturen</h2>
    <p class="muted">
      Zusammenführungen, Trennungen und bearbeitete Einträge ({{ correctionCount() }}) werden im Browser gespeichert.
      Exportiere die Datei, um sie zu sichern oder auf einem anderen Gerät weiterzuarbeiten.
    </p>
    <div class="row">
      <button @click="exportCorrections">Korrekturen exportieren</button>
      <label class="button-like">
        <input type="file" accept=".json,application/json" hidden @change="onPickCorrections" />
        Korrekturen importieren
      </label>
      <span class="spacer" />
      <button class="danger" @click="reset">{{ confirmReset ? 'Wirklich alle Korrekturen löschen?' : 'Korrekturen zurücksetzen' }}</button>
    </div>
  </section>
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
.button-like {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius);
  padding: .35rem .75rem;
  cursor: pointer;
}
.button-like:hover { border-color: var(--accent); }
</style>
