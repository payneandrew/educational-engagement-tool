<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { client, unwrap } from './api'
import DocumentView from './DocumentView.vue'
import ReadingList from './ReadingList.vue'
import { currentUserId } from './session'

type UserRow = { _id: string; name: string; role: 'student' | 'instructor' }
const users = ref<UserRow[]>([])
const hash = ref(location.hash)
const onHash = () => (hash.value = location.hash)

const me = computed(() => users.value.find(u => u._id === currentUserId.value))
const docId = computed(() => /^#\/doc\/(.+)$/.exec(hash.value)?.[1] ?? null)
const nameOf = (id: string) => users.value.find(u => u._id === id)?.name ?? 'Unknown'

onMounted(async () => {
  window.addEventListener('hashchange', onHash)
  users.value = await unwrap(await client.api.users.$get())
  if (!users.value.some(u => u._id === currentUserId.value)) currentUserId.value = users.value[0]._id
})
onUnmounted(() => window.removeEventListener('hashchange', onHash))
</script>

<template>
  <header class="topbar">
    <h1><a href="#">Marginalia</a></h1>
    <span class="spacer" />
    <label>Viewing as
      <select v-model="currentUserId">
        <option v-for="u in users" :key="u._id" :value="u._id">{{ u.name }} — {{ u.role }}</option>
      </select>
    </label>
  </header>

  <template v-if="me">
    <!-- :key on the user remounts the page, which re-fetches and (for a reading) reopens the stream as the new user -->
    <DocumentView v-if="docId" :key="`${me._id}:${docId}`" :document-id="docId" :can-post="me.role === 'student'" :name-of="nameOf" />
    <ReadingList v-else :key="me._id" :can-create="me.role === 'instructor'" :name-of="nameOf" />
  </template>
</template>
