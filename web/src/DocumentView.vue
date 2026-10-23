<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, unwrap, type Annotation, type FeedActions, type Reading } from './api'
import AnnotationFeed from './AnnotationFeed.vue'
import { currentUserId } from './session'
import { useAnnotations } from './useAnnotations'

const props = defineProps<{ documentId: string; canPost: boolean; nameOf: (userId: string) => string }>()

const doc = ref<Reading | null>(null)
const loadError = ref('')
const { load, apply, roots, repliesOf, connectionLost } = useAnnotations(props.documentId)

const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    doc.value = await unwrap(await client.api.readings[':id'].$get({ param: { id: props.documentId } }))
    await load()
  } catch (e) {
    loadError.value = (e as Error).message
  }
})

/**
 * Every mutation returns the post's new state; applying it right away means the author sees their change
 * without waiting for the SSE echo (which then arrives as a no-op, since apply is by id + seq).
 */
async function run(fn: () => Promise<Annotation>) {
  busy.value = true
  error.value = ''
  try {
    apply(await fn())
    return true
  } catch (e) {
    error.value = (e as Error).message
    return false
  } finally {
    busy.value = false
  }
}

const actions: FeedActions = {
  create: (body: string) =>
    run(async () => unwrap(await client.api.readings[':id'].annotations.$post({ param: { id: props.documentId }, json: { body } }))),
  reply: (rootId: string, body: string) =>
    run(async () => unwrap(await client.api.annotations[':id'].replies.$post({ param: { id: rootId }, json: { body } }))),
  edit: (id: string, body: string) => run(async () => unwrap(await client.api.annotations[':id'].$patch({ param: { id }, json: { body } }))),
  remove: (id: string) => run(async () => unwrap(await client.api.annotations[':id'].$delete({ param: { id } }))),
}
</script>

<template>
  <div class="page narrow">
    <a href="#">← All readings</a>
    <p v-if="loadError" class="err">{{ loadError }}</p>
    <template v-if="doc">
      <article class="card reading">
        <h2>{{ doc.title }}</h2>
        <small>Assigned by {{ nameOf(doc.createdBy) }} · {{ new Date(doc.createdAt).toLocaleDateString([], { dateStyle: 'medium' }) }}</small>
        <p>{{ doc.description }}</p>
      </article>
      <p v-if="connectionLost" class="notice" role="status">
        Connection lost — reconnecting. New annotations may be delayed.
      </p>
      <AnnotationFeed
        :roots="roots"
        :replies-of="repliesOf"
        :me="currentUserId"
        :can-post="canPost"
        :busy="busy"
        :error="error"
        :actions="actions"
      />
    </template>
  </div>
</template>
