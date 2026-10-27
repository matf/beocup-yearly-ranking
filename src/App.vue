<script setup lang="ts">
import { ref } from 'vue'
import { entryProblemCount, issues, ranking, state } from './store'
import CupsView from './views/CupsView.vue'
import IssuesView from './views/IssuesView.vue'
import SwimmersView from './views/SwimmersView.vue'
import RankingView from './views/RankingView.vue'
import PrintView from './views/PrintView.vue'
import EntriesView from './views/EntriesView.vue'

type Tab = 'cups' | 'issues' | 'swimmers' | 'ranking' | 'print' | 'entries'

const TABS: { id: Tab; label: string }[] = [
  { id: 'cups', label: 'Cups' },
  { id: 'issues', label: 'Prüfen' },
  { id: 'swimmers', label: 'Schwimmer:innen' },
  { id: 'ranking', label: 'Rangliste' },
  { id: 'print', label: 'Druck' },
  { id: 'entries', label: 'Meldungen' },
]

function initialTab(): Tab {
  const hash = location.hash.slice(1) as Tab
  return TABS.some((t) => t.id === hash) ? hash : 'cups'
}

const tab = ref<Tab>(initialTab())

function select(id: Tab) {
  tab.value = id
  history.replaceState(null, '', `#${id}`)
}
</script>

<template>
  <header class="app-header no-print">
    <div class="title">
      <strong>BEO-Cup Jahreswertung</strong>
      <span v-if="ranking.year" class="muted">
        {{ ranking.year }} · {{ state.cups.length }} von {{ ranking.cupsPerYear }} Cups
      </span>
    </div>
    <nav>
      <button v-for="t in TABS" :key="t.id" :class="{ active: tab === t.id }" @click="select(t.id)">
        {{ t.label }}
        <span v-if="t.id === 'issues' && issues.length" class="badge warn">{{ issues.length }}</span>
        <span v-if="t.id === 'entries' && entryProblemCount" class="badge warn">{{ entryProblemCount }}</span>
      </button>
    </nav>
  </header>

  <main :class="{ print: tab === 'print' }">
    <CupsView v-if="tab === 'cups'" @goto="select" />
    <IssuesView v-else-if="tab === 'issues'" />
    <SwimmersView v-else-if="tab === 'swimmers'" />
    <RankingView v-else-if="tab === 'ranking'" />
    <PrintView v-else-if="tab === 'print'" />
    <EntriesView v-else />
  </main>

  <div class="messages no-print">
    <div v-for="(m, i) in state.messages" :key="i" :class="['message', m.kind]">{{ m.text }}</div>
  </div>
</template>

<style scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem 1.5rem;
  align-items: center;
  padding: .6rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.title { display: flex; flex-direction: column; }
nav { display: flex; gap: .25rem; flex-wrap: wrap; }
nav button { border-color: transparent; }
nav button.active { background: var(--accent-soft); color: var(--accent); }
main { max-width: 1200px; margin: 0 auto; padding: 1rem; }
main.print { max-width: none; }
.messages { position: fixed; bottom: 1rem; right: 1rem; display: flex; flex-direction: column; gap: .5rem; max-width: 420px; }
.message { padding: .6rem .8rem; border-radius: var(--radius); box-shadow: 0 2px 8px rgb(0 0 0 / .12); }
.message.info { background: var(--ok-soft); color: var(--ok); }
.message.error { background: var(--error-soft); color: var(--error); }
@media print { main { padding: 0; } }
</style>
