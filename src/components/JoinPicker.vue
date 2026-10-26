<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Person } from '../core/types'
import { normalizeName, similarity } from '../core/normalize'
import { sharesCup } from '../core/matching'
import { persons } from '../store'

/** Search for the swimmer to join with; only persons without a shared cup are offered. */
const props = defineProps<{ person: Person }>()
const emit = defineEmits<{ pick: [other: Person]; cancel: [] }>()

const query = ref('')

const candidates = computed(() => {
  const q = normalizeName(query.value)
  const self = normalizeName(`${props.person.lastname} ${props.person.firstname}`)
  return persons.value
    .filter((p) => p.id !== props.person.id && !sharesCup(p, props.person))
    .map((p) => {
      const name = normalizeName(`${p.lastname} ${p.firstname}`)
      return { p, name, score: similarity(self, name) }
    })
    .filter((c) => !q || c.name.includes(q))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
})
</script>

<template>
  <div class="join">
    <div class="row">
      <input v-model="query" type="search" placeholder="Name suchen …" autofocus />
      <button @click="emit('cancel')">Abbrechen</button>
    </div>
    <p class="muted">Ähnlichste Namen zuerst. Personen, die am gleichen Cup gestartet sind, können nicht verbunden werden.</p>
    <ul>
      <li v-for="c in candidates" :key="c.p.id">
        <button class="link" @click="emit('pick', c.p)">{{ c.p.lastname }} {{ c.p.firstname }}</button>
        <span class="muted">{{ c.p.birthYear }} · {{ c.p.gender }} · {{ c.p.clubName }} · {{ c.p.entries.length }} Cup(s)</span>
      </li>
      <li v-if="!candidates.length" class="muted">Keine passende Person gefunden.</li>
    </ul>
  </div>
</template>

<style scoped>
.join { padding: .75rem; background: var(--bg); border-radius: var(--radius); margin-top: .5rem; }
.join p { margin: .4rem 0; font-size: .85rem; }
ul { list-style: none; padding: 0; margin: 0; columns: 2; }
li { padding: .15rem 0; break-inside: avoid; }
</style>
