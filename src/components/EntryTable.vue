<script setup lang="ts">
import { computed } from 'vue'
import type { Entry, Person } from '../core/types'
import { STROKES } from '../core/types'
import { STROKE_LABELS, formatDate, formatTime } from '../core/format'
import { cupsByDate, state } from '../store'

const props = defineProps<{ person: Person }>()

const cupOf = (e: Entry) => cupsByDate.value.find((c) => c.id === e.cupId)
const original = (e: Entry) => cupOf(e)?.entries.find((x) => x.key === e.key)

const rows = computed(() =>
  props.person.entries.map((e) => {
    const o = original(e)
    const edited = !!state.corrections.overrides[e.key]
    return {
      entry: e,
      cup: cupOf(e),
      edited,
      originalText: o ? `Datei: ${o.lastname} ${o.firstname}, ${o.birthdate}, ${o.gender}` : '',
    }
  }),
)

function result(e: Entry, stroke: (typeof STROKES)[number]) {
  const r = e.results[stroke]
  if (!r) return ''
  if (!r.time) return r.status || ''
  return r.status ? `${formatTime(r.time)} ${r.status}` : formatTime(r.time)
}
</script>

<template>
  <div class="table-scroll">
    <table class="entries">
      <thead>
        <tr>
          <th>Cup</th>
          <th>Name in der Datei</th>
          <th>Geb.</th>
          <th>G</th>
          <th>Verein</th>
          <th v-for="s in STROKES" :key="s" class="num">{{ STROKE_LABELS[s] }}</th>
          <th v-if="$slots.actions"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.entry.key">
          <td class="nowrap">{{ row.cup?.city }} <span class="muted">{{ row.cup ? formatDate(row.cup.date) : '' }}</span></td>
          <td>
            {{ row.entry.lastname }} {{ row.entry.firstname }}
            <span v-if="row.edited" class="badge" :title="row.originalText">bearbeitet</span>
          </td>
          <td class="nowrap">
            {{ row.entry.birthYear }}
            <span v-if="row.entry.birthdate.endsWith('-01-01')" class="muted" title="Geburtsdatum in der Datei: 1. Januar (oft ein Platzhalter)">*</span>
          </td>
          <td>{{ row.entry.gender }}</td>
          <td>{{ row.entry.clubName }} <span class="muted">({{ row.entry.clubCode }})</span></td>
          <td v-for="s in STROKES" :key="s" class="num">{{ result(row.entry, s) }}</td>
          <td v-if="$slots.actions" class="nowrap"><slot name="actions" :entry="row.entry" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.entries { font-size: .9rem; }
.nowrap { white-space: nowrap; }
</style>
