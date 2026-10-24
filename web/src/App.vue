<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { client, messageOf, unwrap, type User } from './api'
import ReadingView from './ReadingView.vue'
import ReadingList from './ReadingList.vue'
import { currentUserId } from './session'

const users = ref<User[]>([])
const loadError = ref('')
const hash = ref(location.hash)
const onHash = () => (hash.value = location.hash)

const me = computed(() => users.value.find((u) => u.id === currentUserId.value))
const readingId = computed(() => /^#\/reading\/(.+)$/.exec(hash.value)?.[1] ?? null)

onMounted(async () => {
  window.addEventListener('hashchange', onHash)
  try {
    users.value = await unwrap(await client.api.users.$get())
  } catch (e) {
    loadError.value = messageOf(e)
    return
  }
  // A remembered user that no longer exists (e.g. after a reseed) falls back to the first one.
  if (!users.value.some((u) => u.id === currentUserId.value))
    currentUserId.value = users.value[0].id
})
onUnmounted(() => window.removeEventListener('hashchange', onHash))
</script>

<template>
  <header
    class="sticky top-0 z-10 flex items-center gap-4 border-b border-line bg-panel px-5 py-2.5"
  >
    <h1 class="text-lg font-semibold">
      <a href="#" class="text-accent">Marginalia</a>
    </h1>
    <label v-if="users.length" class="ml-auto flex items-center gap-2 text-sm">
      Viewing as
      <select v-model="currentUserId" class="field w-auto">
        <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }} — {{ u.role }}</option>
      </select>
    </label>
  </header>

  <p v-if="loadError" class="mx-auto max-w-3xl px-4 py-5 text-sm text-red-600 dark:text-red-400">
    Couldn't load the app: {{ loadError }}
  </p>
  <template v-else-if="me">
    <!-- :key on the user remounts the page, which re-fetches and (for a reading) reopens the stream as the new user -->
    <ReadingView
      v-if="readingId"
      :key="`${me.id}:${readingId}`"
      :reading-id="readingId"
      :can-post="me.role === 'student'"
    />
    <ReadingList v-else :key="me.id" :can-create="me.role === 'instructor'" />
  </template>
  <p v-else class="mx-auto max-w-3xl px-4 py-5 text-sm text-muted" role="status">Loading…</p>
</template>
