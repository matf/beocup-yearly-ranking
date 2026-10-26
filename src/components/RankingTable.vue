<script setup lang="ts">
import type { Cup } from '../core/types'
import type { RankingRow } from '../core/scoring'
import { formatGap, formatTime, outcomeLabel } from '../core/format'

defineProps<{ rows: RankingRow[]; cups: Cup[]; eligible: boolean }>()
</script>

<template>
  <table class="ranking">
    <thead>
      <tr>
        <th v-if="eligible" class="num">Rang</th>
        <th>Name</th>
        <th class="num">Jg.</th>
        <th>Verein</th>
        <th v-for="c in cups" :key="c.id" class="num">{{ c.city }}</th>
        <th v-if="eligible" class="num">Total</th>
        <th v-if="eligible" class="num">Rückstand</th>
        <th v-else class="num">Cups</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.person.id" :class="{ podium: eligible && row.rank! <= 3 }">
        <td v-if="eligible" class="num">{{ row.rank }}.</td>
        <td>{{ row.person.lastname }} {{ row.person.firstname }}</td>
        <td class="num">{{ row.person.birthYear }}</td>
        <td>{{ row.person.clubName }}</td>
        <td v-for="(o, i) in row.outcomes" :key="i" class="num" :class="{ missing: o.kind !== 'ok' }">{{ outcomeLabel(o) }}</td>
        <td v-if="eligible" class="num total">{{ formatTime(row.total!) }}</td>
        <td v-if="eligible" class="num muted">{{ formatGap(row.gap) }}</td>
        <td v-else class="num">{{ row.participated }} / {{ cups.length }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.ranking { font-size: .9rem; }
.total { font-weight: 600; }
.podium td:first-child { font-weight: 600; }
.missing { color: var(--muted); font-style: italic; font-size: .85em; }
@media print {
  .ranking { font-size: 9pt; }
  .ranking th, .ranking td { padding: 2px 4px; }
}
</style>
