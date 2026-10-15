<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { client, unwrap } from './api'
import DocumentView from './DocumentView.vue'
import InstructorView from './InstructorView.vue'
import { currentUserId } from './session'

type UserRow = { _id: string; name: string; role: 'student' | 'instructor'; groupId: string | null }
const users = ref<UserRow[]>([])
const docs = ref<{ id: string; title: string; author: string; wordCount: number }[]>([])
const hash = ref(location.hash)
const onHash = () => (hash.value = location.hash)

const me = computed(() => users.value.find(u => u._id === currentUserId.value))
const docId = computed(() => /^#\/doc\/(.+)$/.exec(hash.value)?.[1] ?? null)

onMounted(async () => {
  window.addEventListener('hashchange', onHash)
  users.value = await unwrap(await client.api.users.$get())
  if (!users.value.some(u => u._id === currentUserId.value)) currentUserId.value = users.value[0]._id
  docs.value = await unwrap(await client.api.documents.$get())
})
onUnmounted(() => window.removeEventListener('hashchange', onHash))

// Switching identity: instructors have no reader (no group channel), students have no instructor view.
watch(me, u => {
  if (u?.role === 'instructor' && docId.value) location.hash = ''
})
</script>

<template>
  <header class="topbar">
    <h1><a href="#">Marginalia</a></h1>
    <span class="spacer" />
    <label>Viewing as
      <select v-model="currentUserId">
        <option v-for="u in users" :key="u._id" :value="u._id">
          {{ u.name }} — {{ u.role === 'instructor' ? 'instructor' : users.length ? (u.groupId === 'g-a' ? 'Group A' : 'Group B') : '' }}
        </option>
      </select>
    </label>
  </header>

  <template v-if="me">
    <InstructorView v-if="me.role === 'instructor'" :key="me._id" />
    <!-- :key on the user remounts the reader, which re-fetches the snapshot and reopens the stream as the new user -->
    <DocumentView v-else-if="docId" :key="`${me._id}:${docId}`" :document-id="docId" />
    <div v-else class="page">
      <h2>Readings</h2>
      <ul class="doc-list">
        <li v-for="d in docs" :key="d.id">
          <a :href="`#/doc/${d.id}`"><strong>{{ d.title }}</strong><br /><small>{{ d.author }} · {{ d.wordCount.toLocaleString() }} words</small></a>
        </li>
      </ul>
    </div>
  </template>
</template>
