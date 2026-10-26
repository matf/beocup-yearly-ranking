<script setup lang="ts">
import { ref } from 'vue'
import type { Issue } from '../core/issues'
import { ISSUE_LABELS } from '../core/issues'
import { mergePersons, separatePersons, setPersonValues, type CanonicalValues } from '../core/corrections'
import { updateCorrections } from '../store'
import PersonCard from './PersonCard.vue'
import MergeForm from './MergeForm.vue'

const props = defineProps<{ issue: Issue }>()

const merging = ref(false)
const isPair = props.issue.persons.length === 2

function confirm(values: CanonicalValues) {
  updateCorrections((c) =>
    isPair ? mergePersons(c, props.issue.persons, values) : setPersonValues(c, props.issue.persons[0], values),
  )
}

function separate() {
  const [a, b] = props.issue.persons
  updateCorrections((c) => separatePersons(c, a, b))
}
</script>

<template>
  <article class="card issue">
    <header class="row">
      <span class="badge warn">{{ ISSUE_LABELS[issue.type] }}</span>
      <span v-for="d in issue.details" :key="d" class="muted">{{ d }}</span>
    </header>

    <PersonCard v-for="p in issue.persons" :key="p.id" :person="p" />

    <div v-if="!merging" class="row actions">
      <button class="primary" @click="merging = true">{{ isPair ? 'Gleiche Person – zusammenführen …' : 'Korrekte Angaben festlegen …' }}</button>
      <button v-if="isPair" @click="separate">Verschiedene Personen</button>
      <span class="muted">oder einzelne Einträge oben bearbeiten</span>
    </div>
    <MergeForm
      v-else
      :persons="issue.persons"
      :confirm-label="isPair ? 'Zusammenführen' : 'Für alle Einträge übernehmen'"
      @confirm="confirm"
      @cancel="merging = false"
    />
  </article>
</template>

<style scoped>
.issue header { margin-bottom: .25rem; }
.issue :deep(.person + .person) { border-top: 1px dashed var(--border); }
.actions { margin-top: .5rem; }
</style>
