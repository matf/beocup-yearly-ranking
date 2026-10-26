<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Gender, Person } from '../core/types'
import type { CanonicalValues } from '../core/corrections'

/** Lets the operator choose the correct name, birth year and gender for one swimmer. */
const props = defineProps<{ persons: Person[]; confirmLabel: string }>()
const emit = defineEmits<{ confirm: [values: CanonicalValues]; cancel: [] }>()

const entries = computed(() => props.persons.flatMap((p) => p.entries))
const unique = <T,>(values: T[]) => [...new Set(values)]

const names = computed(() => unique(entries.value.map((e) => `${e.lastname}\t${e.firstname}`)).map((n) => n.split('\t')))
const years = computed(() => unique(entries.value.map((e) => e.birthYear)).sort())
const genders = computed(() => unique(entries.value.map((e) => e.gender)))

// default: values of the person with the most cups
const latest = computed(() => [...props.persons].sort((a, b) => b.entries.length - a.entries.length)[0])
const form = reactive({
  lastname: latest.value.lastname,
  firstname: latest.value.firstname,
  birthYear: latest.value.birthYear,
  gender: latest.value.gender as Gender,
})

function pickName([last, first]: string[]) {
  form.lastname = last
  form.firstname = first
}

const valid = computed(() => form.lastname.trim() && form.firstname.trim() && form.birthYear > 1900)

function confirm() {
  emit('confirm', {
    lastname: form.lastname.trim(),
    firstname: form.firstname.trim(),
    birthYear: Number(form.birthYear),
    gender: form.gender,
  })
}
</script>

<template>
  <div class="merge-form">
    <div class="field">
      <span class="label">Name</span>
      <div class="choices">
        <button
          v-for="n in names"
          :key="n.join(' ')"
          :class="{ chosen: form.lastname === n[0] && form.firstname === n[1] }"
          @click="pickName(n)"
        >{{ n[0] }} {{ n[1] }}</button>
      </div>
      <div class="row">
        <input v-model="form.lastname" type="text" placeholder="Nachname" />
        <input v-model="form.firstname" type="text" placeholder="Vorname" />
      </div>
    </div>
    <div class="field">
      <span class="label">Jahrgang</span>
      <div class="choices">
        <button v-for="y in years" :key="y" :class="{ chosen: form.birthYear === y }" @click="form.birthYear = y">{{ y }}</button>
        <input v-model.number="form.birthYear" type="number" min="1900" max="2100" style="width: 6rem" />
      </div>
    </div>
    <div class="field">
      <span class="label">Geschlecht</span>
      <div class="choices">
        <button :class="{ chosen: form.gender === 'F' }" @click="form.gender = 'F'">weiblich{{ genders.includes('F') ? '' : ' (neu)' }}</button>
        <button :class="{ chosen: form.gender === 'M' }" @click="form.gender = 'M'">männlich{{ genders.includes('M') ? '' : ' (neu)' }}</button>
      </div>
    </div>
    <div class="row">
      <button class="primary" :disabled="!valid" @click="confirm">{{ confirmLabel }}</button>
      <button @click="emit('cancel')">Abbrechen</button>
    </div>
  </div>
</template>

<style scoped>
.merge-form { display: flex; flex-direction: column; gap: .6rem; padding: .75rem; background: var(--bg); border-radius: var(--radius); margin-top: .5rem; }
.field { display: grid; grid-template-columns: 6rem 1fr; gap: .25rem .75rem; align-items: start; }
.field > .row { grid-column: 2; }
.label { font-weight: 600; padding-top: .35rem; }
.choices { display: flex; gap: .35rem; flex-wrap: wrap; align-items: center; }
.choices button.chosen { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
</style>
