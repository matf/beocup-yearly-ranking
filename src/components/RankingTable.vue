<script setup lang="ts">
import type { Cup } from '../core/types'
import type { RankingRow } from '../core/scoring'
import { formatGap, formatTime, outcomeLabel, outcomeShortLabel } from '../core/format'

defineProps<{ rows: RankingRow[]; cups: Cup[]; eligible: boolean }>()
</script>

<template>
  <!-- .long/.short: full wording on screen, compact wording on paper -->
  <table class="ranking">
    <thead>
      <tr>
        <th v-if="eligible" class="num col-rank"><span class="long">Rang</span><span class="short">Rg.</span></th>
        <th class="col-name">Name</th>
        <th class="num col-year">Jg.</th>
        <th class="col-club">Verein</th>
        <th v-for="c in cups" :key="c.id" class="num col-cup">{{ c.city }}</th>
        <th v-if="eligible" class="num col-total">Total</th>
        <th v-if="eligible" class="num col-gap"><span class="long">Rückstand</span><span class="short">Rückst.</span></th>
        <th v-else class="num col-cups">Cups</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.person.id" :class="{ podium: eligible && row.rank! <= 3 }">
        <td v-if="eligible" class="num">{{ row.rank }}.</td>
        <td class="text">{{ row.person.lastname }} {{ row.person.firstname }}</td>
        <td class="num">{{ row.person.birthYear }}</td>
        <td class="text">{{ row.person.clubName }}</td>
        <td v-for="(o, i) in row.outcomes" :key="i" class="num" :class="{ missing: o.kind !== 'ok' }">
          <span class="long">{{ outcomeLabel(o) }}</span><span class="short">{{ outcomeShortLabel(o) }}</span>
        </td>
        <td v-if="eligible" class="num total">{{ formatTime(row.total!) }}</td>
        <td v-if="eligible" class="num muted">{{ formatGap(row.gap) }}</td>
        <td v-else class="num">{{ row.participated }} / {{ cups.length }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* fixed layout so all category tables line up */
.ranking { font-size: .9rem; table-layout: fixed; min-width: 760px; }
.col-rank { width: 4rem; }
.col-name { width: 22%; }
.col-year { width: 3.5rem; }
.col-club { width: 20%; }
.total { font-weight: 600; }
.podium td:first-child { font-weight: 600; }
.missing { color: var(--muted); font-style: italic; font-size: .85em; }
.short { display: none; }
@media print {
  /* A4 portrait with 10mm margins leaves 190mm: fixed mm widths for numbers, the rest for name and club */
  .ranking { font-size: 8pt; min-width: 0; width: 100%; }
  .ranking th, .ranking td { padding: 1.5pt 2.5pt; }
  .ranking th { font-size: 7.5pt; }
  .col-rank { width: 8mm; }
  .col-name { width: auto; }
  .col-year { width: 8mm; }
  .col-club { width: auto; }
  .col-cup { width: 14.5mm; }
  .col-total { width: 14mm; }
  .col-gap { width: 15.5mm; }
  .col-cups { width: 10mm; }
  .text { white-space: normal; overflow-wrap: anywhere; }
  .missing { font-size: 1em; }
  .long { display: none; }
  .short { display: inline; }
}
</style>
