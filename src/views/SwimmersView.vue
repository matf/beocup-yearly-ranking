<script setup lang="ts">
import { computed, ref } from 'vue'
import { normalizeName } from '../core/normalize'
import { cupsByDate, persons, state } from '../store'
import PersonCard from '../components/PersonCard.vue'

const query = ref('')
const filter = ref<'all' | 'complete' | 'incomplete' | 'corrected'>('all')

const visible = computed(() => {
  const q = normalizeName(query.value)
  return persons.value.filter((p) => {
    if (q && !normalizeName(`${p.lastname} ${p.firstname} ${p.firstname} ${p.lastname} ${p.clubName}`).includes(q)) return false
    if (filter.value === 'complete') return p.entries.length === cupsByDate.value.length
    if (filter.value === 'incomplete') return p.entries.length < cupsByDate.value.length
    if (filter.value === 'corrected') return p.entries.some((e) => state.corrections.overrides[e.key])
    return true
  })
})

const expanded = ref(new Set<string>())
function toggle(id: string) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}
</script>

<template>
  <section>
    <div class="row toolbar">
      <h2>Schwimmer:innen <span class="muted">({{ visible.length }} von {{ persons.length }})</span></h2>
      <span class="spacer" />
      <input v-model="query" type="search" placeholder="Name oder Verein suchen …" />
      <select v-model="filter">
        <option value="all">Alle</option>
        <option value="complete">An allen Cups</option>
        <option value="incomplete">Nicht an allen Cups</option>
        <option value="corrected">Korrigiert</option>
      </select>
    </div>

    <div class="card list">
      <div v-for="p in visible" :key="p.id" class="item">
        <button class="summary" @click="toggle(p.id)">
          <span class="caret">{{ expanded.has(p.id) ? '▾' : '▸' }}</span>
          <strong>{{ p.lastname }} {{ p.firstname }}</strong>
          <span class="muted">{{ p.birthYear }} · {{ p.gender }} · {{ p.clubName }}</span>
          <span class="spacer" />
          <span class="cups">
            <span
              v-for="c in cupsByDate"
              :key="c.id"
              :class="['dot', { on: p.entries.some((e) => e.cupId === c.id) }]"
              :title="c.city"
            />
          </span>
        </button>
        <PersonCard v-if="expanded.has(p.id)" :person="p" class="detail" />
      </div>
      <p v-if="!visible.length" class="muted">Keine Schwimmer:innen gefunden.</p>
    </div>
  </section>
</template>

<style scoped>
.toolbar { margin-bottom: .5rem; }
.toolbar h2 { margin: 0; }
.list { padding: 0; }
.item { border-bottom: 1px solid var(--border); }
.item:last-child { border-bottom: none; }
.summary {
  display: flex; gap: .5rem; align-items: center; width: 100%;
  border: none; border-radius: 0; background: none; padding: .5rem .75rem; text-align: left;
}
.summary:hover { background: var(--bg); }
.caret { width: 1rem; color: var(--muted); }
.cups { display: flex; gap: 3px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); }
.dot.on { background: var(--ok); }
.detail { padding: 0 .75rem .75rem; }
</style>
