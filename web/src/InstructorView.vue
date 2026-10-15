<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { client, unwrap, type ScoreRow } from './api'

const docs = ref<{ id: string; title: string }[]>([])
const docId = ref('')
const rows = ref<ScoreRow[]>([])
const cfg = ref<Awaited<ReturnType<typeof loadConfig>> | null>(null)
const msg = ref('')

const loadConfig = async () => unwrap(await client.api.instructor['scoring-config'].$get())

async function loadScores() {
  if (!docId.value) return
  const res = await unwrap(await client.api.instructor.documents[':id'].scores.$get({ param: { id: docId.value } }))
  rows.value = res.rows
}

onMounted(async () => {
  docs.value = await unwrap(await client.api.documents.$get())
  docId.value = docs.value[0]?.id ?? ''
  cfg.value = await loadConfig()
})
watch(docId, loadScores, { immediate: true })

async function save() {
  msg.value = ''
  try {
    // Scores are derived at read time, so saving the config re-scores all history; we just re-read.
    cfg.value = await unwrap(await client.api.instructor['scoring-config'].$put({ json: cfg.value! }))
    await loadScores()
    msg.value = 'Saved — scores recomputed from all existing activity.'
  } catch (e) {
    msg.value = (e as Error).message
  }
}

const labels = {
  commentPoints: 'Points per comment',
  replyPoints: 'Points per reply',
  upvoteReceivedPoints: 'Points per upvote received',
  upvoteGivenPoints: 'Points per upvote given',
  minChars: 'Min characters to count',
  maxUpvotesPerPost: 'Max upvotes counted per post',
} as const
</script>

<template>
  <div class="page">
    <div class="row">
      <h2 class="spacer" style="margin: 0">Engagement</h2>
      <select v-model="docId"><option v-for="d in docs" :key="d.id" :value="d.id">{{ d.title }}</option></select>
      <button @click="loadScores">Refresh</button>
    </div>
    <table style="margin-top: 14px">
      <thead><tr><th>Student</th><th>Group</th><th>Comments</th><th>Replies</th><th>Upvotes recv.</th><th>Upvotes given</th><th>Score</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.userId">
          <td>{{ r.name }}</td><td>{{ r.groupName }}</td><td>{{ r.comments }}</td><td>{{ r.replies }}</td>
          <td>{{ r.upvotesReceived }}</td><td>{{ r.upvotesGiven }}</td><td><strong>{{ r.score }}</strong></td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin-top: 28px">Scoring config</h3>
    <form v-if="cfg" @submit.prevent="save">
      <div class="cfg">
        <label v-for="(label, key) in labels" :key="key">{{ label }}
          <input v-model.number="cfg[key]" type="number" min="0" step="any" />
        </label>
      </div>
      <button class="primary" type="submit">Save &amp; recompute</button>
      <span class="status" style="margin-left: 10px">{{ msg }}</span>
    </form>
  </div>
</template>
