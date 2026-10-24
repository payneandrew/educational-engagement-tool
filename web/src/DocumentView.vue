<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, unwrap, type FeedActions, type ReadingDetail } from './api'
import { plural } from './format'
import AnnotationFeed from './AnnotationFeed.vue'
import { currentUserId } from './session'
import { useAnnotations } from './useAnnotations'

const props = defineProps<{ documentId: string; canPost: boolean; nameOf: (userId: string) => string }>()

const doc = ref<ReadingDetail | null>(null)
const loadError = ref('')
const { apply, roots, repliesOf, total, studentCount, connectionLost, loadError: annotationsError } = useAnnotations(props.documentId)

const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    doc.value = await unwrap(await client.api.readings[':id'].$get({ param: { id: props.documentId } }))
  } catch (e) {
    loadError.value = (e as Error).message
  }
})

/**
 * Applying each result right away means the author sees their change without waiting for the SSE
 * event (which then arrives too and just sets the same values again).
 */
async function run(fn: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    return true
  } catch (e) {
    error.value = (e as Error).message
    return false
  } finally {
    busy.value = false
  }
}

const actions: FeedActions = {
  create: body =>
    run(async () => {
      const annotation = await unwrap(await client.api.readings[':id'].annotations.$post({ param: { id: props.documentId }, json: { body } }))
      apply({ type: 'annotation', annotation })
    }),
  reply: (rootId, body) =>
    run(async () => {
      const annotation = await unwrap(await client.api.annotations[':id'].replies.$post({ param: { id: rootId }, json: { body } }))
      apply({ type: 'annotation', annotation })
    }),
  edit: (id, body) =>
    run(async () => {
      const annotation = await unwrap(await client.api.annotations[':id'].$patch({ param: { id }, json: { body } }))
      apply({ type: 'annotation', annotation })
    }),
  remove: id =>
    run(async () => {
      const { ids } = await unwrap(await client.api.annotations[':id'].$delete({ param: { id } }))
      apply({ type: 'deleted', ids })
    }),
}
</script>

<template>
  <div class="page narrow">
    <a href="#">← All readings</a>
    <p v-if="loadError || annotationsError" class="err">{{ loadError || annotationsError }}</p>
    <template v-if="doc">
      <article class="card reading">
        <h2>{{ doc.title }}</h2>
        <small>Assigned by {{ nameOf(doc.createdBy) }} · {{ new Date(doc.createdAt).toLocaleDateString([], { dateStyle: 'medium' }) }}</small>
        <p>{{ doc.description }}</p>
      </article>
      <!-- Instructor overview: counts come from the live feed, so they update as students post. -->
      <dl v-if="!canPost" class="stats">
        <div><dt>Annotations</dt><dd>{{ total }}</dd></div>
        <div><dt>Students participating</dt><dd>{{ studentCount }}</dd></div>
      </dl>
      <p v-if="connectionLost" class="notice" role="status">
        Connection lost — reconnecting. New annotations may be delayed.
      </p>
      <AnnotationFeed
        :roots="roots"
        :replies-of="repliesOf"
        :total="total"
        :me="currentUserId"
        :can-post="canPost"
        :busy="busy"
        :error="error"
        :actions="actions"
      />
    </template>
  </div>
</template>
