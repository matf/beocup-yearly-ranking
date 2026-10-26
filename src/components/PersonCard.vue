<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Entry, Person } from '../core/types'
import { categoryForAge } from '../core/scoring'
import { genderLabel } from '../core/format'
import { detachEntry, mergePersons, type CanonicalValues } from '../core/corrections'
import { ranking, state, updateCorrections } from '../store'
import EntryTable from './EntryTable.vue'
import EntryEditForm from './EntryEditForm.vue'
import JoinPicker from './JoinPicker.vue'
import MergeForm from './MergeForm.vue'

/** A swimmer with all entries and the single-entry actions: edit, join, detach. */
const props = defineProps<{ person: Person }>()

const editing = ref<Entry | null>(null)
const joining = ref(false)
const joinWith = ref<Person | null>(null)

const category = computed(() => categoryForAge(ranking.value.year - props.person.birthYear))

function detach(entry: Entry) {
  updateCorrections((c) => detachEntry(c, props.person, entry.key))
}

function confirmJoin(values: CanonicalValues) {
  if (!joinWith.value) return
  const other = joinWith.value
  updateCorrections((c) => mergePersons(c, [props.person, other], values))
  joining.value = false
  joinWith.value = null
}

const mergedCount = computed(() => props.person.entries.filter((e) => state.corrections.overrides[e.key]).length)
</script>

<template>
  <div class="person">
    <div class="row head">
      <strong>{{ person.lastname }} {{ person.firstname }}</strong>
      <span class="muted">{{ person.birthYear }} · Kat. {{ category }} {{ genderLabel(category, person.gender) }} · {{ person.clubName }}</span>
      <span class="badge">{{ person.entries.length }} Cup{{ person.entries.length === 1 ? '' : 's' }}</span>
      <span v-if="mergedCount" class="badge ok">korrigiert</span>
      <span class="spacer" />
      <button v-if="!joining" class="link" @click="joining = true">Mit anderer Person verbinden …</button>
    </div>

    <EntryTable :person="person">
      <template #actions="{ entry }">
        <button class="link" @click="editing = editing?.key === entry.key ? null : entry">Bearbeiten</button>
        <button v-if="person.entries.length > 1" class="link" title="Diesen Eintrag als eigene Person behandeln" @click="detach(entry)">Abtrennen</button>
      </template>
    </EntryTable>

    <EntryEditForm v-if="editing" :key="editing.key" :entry="editing" @done="editing = null" />

    <template v-if="joining">
      <JoinPicker v-if="!joinWith" :person="person" @pick="joinWith = $event" @cancel="joining = false" />
      <div v-else>
        <p class="join-head">
          Verbinden mit <strong>{{ joinWith.lastname }} {{ joinWith.firstname }}</strong> ({{ joinWith.birthYear }}, {{ joinWith.clubName }}).
          Korrekte Angaben wählen:
        </p>
        <EntryTable :person="joinWith" />
        <MergeForm :persons="[person, joinWith]" confirm-label="Zusammenführen" @confirm="confirmJoin" @cancel="joinWith = null" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.person { padding: .5rem 0; }
.head { margin-bottom: .25rem; }
.join-head { margin: .75rem 0 .25rem; }
</style>
