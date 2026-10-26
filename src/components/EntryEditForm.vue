<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Entry, Gender } from '../core/types'
import { cupsByDate, state, updateCorrections } from '../store'
import { setOverride } from '../core/corrections'

/** Edits the data of one entry; values equal to the file are not stored as override. */
const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ done: [] }>()

const original = computed(() =>
  cupsByDate.value.find((c) => c.id === props.entry.cupId)?.entries.find((e) => e.key === props.entry.key) ?? props.entry,
)

const form = reactive({
  lastname: props.entry.lastname,
  firstname: props.entry.firstname,
  birthYear: props.entry.birthYear,
  gender: props.entry.gender as Gender,
})

function save() {
  const o = original.value
  updateCorrections((c) =>
    setOverride(c, props.entry.key, {
      lastname: form.lastname.trim() !== o.lastname ? form.lastname.trim() : undefined,
      firstname: form.firstname.trim() !== o.firstname ? form.firstname.trim() : undefined,
      birthYear: Number(form.birthYear) !== o.birthYear ? Number(form.birthYear) : undefined,
      gender: form.gender !== o.gender ? form.gender : undefined,
    }),
  )
  emit('done')
}

function restore() {
  updateCorrections((c) => setOverride(c, props.entry.key, {}))
  emit('done')
}
</script>

<template>
  <div class="edit-form">
    <div class="row">
      <label>Nachname <input v-model="form.lastname" type="text" /></label>
      <label>Vorname <input v-model="form.firstname" type="text" /></label>
      <label>Jahrgang <input v-model.number="form.birthYear" type="number" min="1900" max="2100" style="width: 6rem" /></label>
      <label>
        Geschlecht
        <select v-model="form.gender">
          <option value="F">weiblich</option>
          <option value="M">männlich</option>
        </select>
      </label>
    </div>
    <p class="muted">
      In der Datei: {{ original.lastname }} {{ original.firstname }}, {{ original.birthdate }}, {{ original.gender }}
    </p>
    <div class="row">
      <button class="primary" :disabled="!form.lastname.trim() || !form.firstname.trim()" @click="save">Speichern</button>
      <button v-if="state.corrections.overrides[entry.key]" @click="restore">Werte aus Datei wiederherstellen</button>
      <button @click="emit('done')">Abbrechen</button>
    </div>
  </div>
</template>

<style scoped>
.edit-form { padding: .75rem; background: var(--bg); border-radius: var(--radius); margin-top: .5rem; }
.edit-form label { display: flex; flex-direction: column; gap: .15rem; font-size: .85rem; color: var(--muted); }
.edit-form p { margin: .5rem 0; }
</style>
