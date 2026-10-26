<script setup lang="ts">
import { issues, state } from '../store'
import IssueCard from '../components/IssueCard.vue'
</script>

<template>
  <section>
    <h2>Verdächtige Einträge prüfen</h2>
    <p class="muted">
      Einträge aus verschiedenen Cups, die vermutlich dieselbe Person sind (vertauschte Namen, abweichender
      Jahrgang oder Geschlecht, ähnliche Schreibweise), oder Personen mit widersprüchlichen Angaben.
      Gleich geschriebene Namen mit gleichem Jahrgang und Geschlecht werden automatisch zusammengeführt.
    </p>
    <p v-if="!state.cups.length" class="card muted">Zuerst Cups laden.</p>
    <p v-else-if="!issues.length" class="card"><span class="badge ok">Alles geprüft</span> Keine verdächtigen Einträge.</p>
    <IssueCard v-for="issue in issues" :key="issue.id" :issue="issue" />
  </section>
</template>
