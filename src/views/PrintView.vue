<script setup lang="ts">
import { computed, reactive } from 'vue'
import { issues, ranking } from '../store'
import { ageLabel, formatDate, formatTime, groupTitle } from '../core/format'
import RankingTable from '../components/RankingTable.vue'

const options = reactive({ table: true, notEligible: true, winners: true })

const title = computed(() => `BEO-Cup Jahreswertung ${ranking.value.year}`)
const subtitle = computed(() => {
  const cups = ranking.value.cups.map((c) => `${c.city} (${formatDate(c.date)})`).join(' · ')
  return ranking.value.final ? cups : `Zwischenstand nach ${ranking.value.cups.length} von ${ranking.value.cupsPerYear} Cups – ${cups}`
})

const winners = computed(() =>
  ranking.value.groups.map((g) => ({ g, winners: g.ranked.filter((r) => r.rank === 1) })),
)
function print() {
  window.print()
}

const groupsWithNotEligible = computed(() => ranking.value.groups.filter((g) => g.notEligible.length))
</script>

<template>
  <div class="card no-print">
    <h2>Druck</h2>
    <div class="row">
      <label><input v-model="options.table" type="checkbox" /> Jahresrangliste</label>
      <label><input v-model="options.notEligible" type="checkbox" /> Nicht qualifizierte</label>
      <label><input v-model="options.winners" type="checkbox" /> Jahressieger:innen</label>
      <span class="spacer" />
      <button class="primary" :disabled="!ranking.cups.length" @click="print">Drucken / als PDF speichern</button>
    </div>
    <p v-if="issues.length" class="muted">Hinweis: {{ issues.length }} verdächtige Einträge sind noch nicht geprüft.</p>
  </div>

  <div v-if="ranking.cups.length" class="paper">
    <section v-if="options.winners" class="sheet">
      <h1>{{ title }}</h1>
      <p class="sub">{{ subtitle }}</p>
      <h2>Jahressieger:innen</h2>
      <table class="winners">
        <thead><tr><th>Kategorie</th><th>Name</th><th class="num">Jg.</th><th>Verein</th><th class="num">Total</th></tr></thead>
        <tbody>
          <tr v-for="{ g, winners: ws } in winners" :key="g.category + g.gender">
            <td>{{ groupTitle(g.category, g.gender) }}</td>
            <template v-if="ws.length">
              <td>{{ ws.map((w) => `${w.person.lastname} ${w.person.firstname}`).join(', ') }}</td>
              <td class="num">{{ ws.map((w) => w.person.birthYear).join(', ') }}</td>
              <td>{{ ws.map((w) => w.person.clubName).join(', ') }}</td>
              <td class="num">{{ formatTime(ws[0].total!) }}</td>
            </template>
            <td v-else colspan="4" class="muted">keine qualifizierte Teilnahme</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="options.table" class="sheet">
      <h1>{{ title }}</h1>
      <p class="sub">{{ subtitle }}</p>
      <div v-for="g in ranking.groups" :key="g.category + g.gender" class="group">
        <h3>{{ groupTitle(g.category, g.gender) }} <span class="muted">{{ ageLabel(g.category) }}</span></h3>
        <RankingTable v-if="g.ranked.length" :rows="g.ranked" :cups="ranking.cups" eligible />
        <p v-else class="muted">Niemand hat an allen Cups teilgenommen.</p>
      </div>
    </section>

    <section v-if="options.notEligible && groupsWithNotEligible.length" class="sheet">
      <h1>{{ title }} – nicht qualifiziert</h1>
      <p class="sub">Schwimmer:innen ohne gültige Gesamtzeit an allen Cups</p>
      <div v-for="g in groupsWithNotEligible" :key="g.category + g.gender" class="group">
        <h3>{{ groupTitle(g.category, g.gender) }} <span class="muted">{{ ageLabel(g.category) }}</span></h3>
        <RankingTable :rows="g.notEligible" :cups="ranking.cups" :eligible="false" />
      </div>
    </section>
  </div>
  <p v-else class="card muted">Zuerst Cups laden.</p>
</template>

<style scoped>
.paper { background: #fff; color: #000; }
.sheet { padding: 1.5rem; border: 1px solid var(--border); margin-bottom: 1rem; }
.sheet h1 { font-size: 1.4rem; margin-bottom: .2rem; }
.sub { color: var(--muted); margin: 0 0 1rem; }
.group { margin-bottom: 1.25rem; break-inside: avoid; }
.group h3 { margin-bottom: .25rem; }
.winners td, .winners th { padding: .4rem .5rem; }
@media print {
  .sheet { border: none; padding: 0; margin: 0; break-after: page; }
  .sheet:last-child { break-after: auto; }
  .sheet h1 { font-size: 16pt; }
  .group h3 { font-size: 11pt; }
}
</style>
