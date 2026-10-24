<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, unwrap, type FeedActions, type ReadingDetail } from './api'
import AnnotationFeed from './AnnotationFeed.vue'
import { currentUserId } from './session'
import { useAnnotations } from './useAnnotations'

const props = defineProps<{
  readingId: string
  canPost: boolean
  nameOf: (userId: string) => string
}>()

const reading = ref<ReadingDetail | null>(null)
const loadError = ref('')
const {
  apply,
  roots,
  repliesOf,
  total,
  studentCount,
  connectionLost,
  loadError: annotationsError,
} = useAnnotations(props.readingId)

const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    reading.value = await unwrap(
      await client.api.readings[':id'].$get({ param: { id: props.readingId } }),
    )
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
  create: (body) =>
    run(async () => {
      const annotation = await unwrap(
        await client.api.readings[':id'].annotations.$post({
          param: { id: props.readingId },
          json: { body },
        }),
      )
      apply({ type: 'annotation', annotation })
    }),
  reply: (rootId, body) =>
    run(async () => {
      const annotation = await unwrap(
        await client.api.annotations[':id'].replies.$post({
          param: { id: rootId },
          json: { body },
        }),
      )
      apply({ type: 'annotation', annotation })
    }),
  edit: (id, body) =>
    run(async () => {
      const annotation = await unwrap(
        await client.api.annotations[':id'].$patch({ param: { id }, json: { body } }),
      )
      apply({ type: 'annotation', annotation })
    }),
  remove: (id) =>
    run(async () => {
      const { ids } = await unwrap(await client.api.annotations[':id'].$delete({ param: { id } }))
      apply({ type: 'deleted', ids })
    }),
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-5">
    <a href="#" class="text-sm text-accent hover:underline">← All readings</a>
    <p v-if="loadError || annotationsError" class="mt-2 text-sm text-red-600 dark:text-red-400">
      {{ loadError || annotationsError }}
    </p>
    <template v-if="reading">
      <article class="mt-2.5 mb-4 rounded-lg border border-line bg-panel p-4">
        <h2 class="text-2xl font-bold">{{ reading.title }}</h2>
        <p class="text-sm text-muted">
          Assigned by {{ nameOf(reading.createdBy) }} ·
          {{ new Date(reading.createdAt).toLocaleDateString([], { dateStyle: 'medium' }) }}
        </p>
        <p class="mt-3 leading-relaxed whitespace-pre-wrap">{{ reading.description }}</p>
      </article>
      <!-- Instructor overview: counts come from the live feed, so they update as students post. -->
      <dl v-if="!canPost" class="mb-4 grid grid-cols-2 gap-2.5">
        <div class="rounded-lg border border-line bg-panel px-3.5 py-2.5">
          <dt class="text-xs tracking-wide text-muted uppercase">Annotations</dt>
          <dd class="mt-0.5 text-2xl font-semibold">{{ total }}</dd>
        </div>
        <div class="rounded-lg border border-line bg-panel px-3.5 py-2.5">
          <dt class="text-xs tracking-wide text-muted uppercase">Students participating</dt>
          <dd class="mt-0.5 text-2xl font-semibold">{{ studentCount }}</dd>
        </div>
      </dl>
      <p
        v-if="connectionLost"
        role="status"
        class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
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
