<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { client, messageOf, unwrap, type User } from './api'
import ParticipationView from './ParticipationView.vue'
import ReadingView from './ReadingView.vue'
import ReadingList from './ReadingList.vue'
import { currentUserId } from './session'

const users = ref<User[]>([])
const loadError = ref('')
const hash = ref(location.hash)
const onHash = () => (hash.value = location.hash)

const currentUser = computed(() => users.value.find((user) => user.id === currentUserId.value))
const readingId = computed(() => /^#\/reading\/(.+)$/.exec(hash.value)?.[1] ?? null)
const onParticipation = computed(() => hash.value === '#/participation')

onMounted(async () => {
  window.addEventListener('hashchange', onHash)
  try {
    users.value = await unwrap(await client.api.users.$get())
  } catch (error) {
    loadError.value = messageOf(error)
    return
  }
  // A remembered user that no longer exists (e.g. after a reseed) falls back to the first one.
  if (!users.value.some((user) => user.id === currentUserId.value))
    currentUserId.value = users.value[0].id
})
onUnmounted(() => window.removeEventListener('hashchange', onHash))
</script>

<template>
  <header
    class="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-5 py-2.5"
  >
    <h1 class="text-lg font-semibold">
      <a href="#" class="text-accent">Marginalia</a>
    </h1>
    <nav v-if="currentUser?.role === 'instructor'" class="flex gap-4 text-sm">
      <a href="#" :class="!onParticipation && !readingId ? 'font-semibold' : 'text-muted'">
        Readings
      </a>
      <a href="#/participation" :class="onParticipation ? 'font-semibold' : 'text-muted'">
        Participation
      </a>
    </nav>
    <label v-if="users.length" class="ml-auto flex items-center gap-2 text-sm">
      Viewing as
      <select v-model="currentUserId" class="field w-auto">
        <option v-for="user in users" :key="user.id" :value="user.id">
          {{ user.name }} — {{ user.role }}
        </option>
      </select>
    </label>
  </header>

  <p v-if="loadError" class="mx-auto max-w-3xl px-4 py-5 text-sm text-red-600 dark:text-red-400">
    Couldn't load the app: {{ loadError }}
  </p>
  <template v-else-if="currentUser">
    <!-- :key on the user remounts the page, which re-fetches and (for a reading) reopens the stream as the new user -->
    <ReadingView
      v-if="readingId"
      :key="`reading:${currentUser.id}:${readingId}`"
      :reading-id="readingId"
      :can-post="currentUser.role === 'student'"
    />
    <ParticipationView
      v-else-if="onParticipation && currentUser.role === 'instructor'"
      :key="`participation:${currentUser.id}`"
    />
    <ReadingList
      v-else
      :key="`readings:${currentUser.id}`"
      :can-create="currentUser.role === 'instructor'"
    />
  </template>
  <p v-else class="mx-auto max-w-3xl px-4 py-5 text-sm text-muted" role="status">Loading…</p>
</template>
