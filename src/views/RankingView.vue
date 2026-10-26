<script setup lang="ts">
import { ref } from 'vue'
import { issues, ranking, state } from '../store'
import { ageLabel, groupTitle } from '../core/format'
import RankingTable from '../components/RankingTable.vue'

const showNotEligible = ref(false)
</script>

<template>
  <section>
    <div class="row">
      <h2>
        Jahreswertung {{ ranking.year || '' }}
        <span v-if="!ranking.final" class="badge warn">Zwischenstand nach {{ ranking.cups.length }} von {{ ranking.cupsPerYear }} Cups</span>
      </h2>
      <span class="spacer" />
      <label class="row"><input v-model="showNotEligible" type="checkbox" /> Nicht qualifizierte anzeigen</label>
    </div>
    <p v-if="issues.length" class="card warn-box">
      Es gibt noch {{ issues.length }} ungeprüfte verdächtige Einträge – die Rangliste kann sich nach der Prüfung ändern.
    </p>
    <p v-if="!state.cups.length" class="card muted">Zuerst Cups laden.</p>

    <template v-else>
      <article v-for="g in ranking.groups" :key="g.category + g.gender" class="card">
        <h3>{{ groupTitle(g.category, g.gender) }} <span class="muted">({{ ageLabel(g.category) }})</span></h3>
        <div class="table-scroll">
          <RankingTable v-if="g.ranked.length" :rows="g.ranked" :cups="ranking.cups" eligible />
          <p v-else class="muted">Niemand hat an allen Cups teilgenommen.</p>
        </div>
        <template v-if="showNotEligible && g.notEligible.length">
          <h4 class="muted">Nicht qualifiziert ({{ g.notEligible.length }})</h4>
          <div class="table-scroll">
            <RankingTable :rows="g.notEligible" :cups="ranking.cups" :eligible="false" />
          </div>
        </template>
      </article>
    </template>
  </section>
</template>

<style scoped>
.warn-box { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
h4 { margin: 1rem 0 .25rem; font-size: .9rem; }
</style>
