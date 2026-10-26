<script setup lang="ts">
import ConfirmDialog from 'primevue/confirmdialog'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Toast from 'primevue/toast'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { client, messageOf, parseResponse, type User } from '@/api/client'
import { currentUserId } from '@/api/session'
import UserAvatar from '@/components/UserAvatar.vue'
import ParticipationView from '@/views/ParticipationView.vue'
import ReadingListView from '@/views/ReadingListView.vue'
import ReadingView from '@/views/ReadingView.vue'

const users = ref<User[]>([])
const loadError = ref('')
const hash = ref(location.hash)
const onHash = () => (hash.value = location.hash)

const currentUser = computed(() => users.value.find((user) => user.id === currentUserId.value))
const readingId = computed(() => /^#\/reading\/(.+)$/.exec(hash.value)?.[1] ?? null)
const onParticipation = computed(() => hash.value === '#/participation')

/** The identity switcher (stand-in for login), grouped by role. */
const userGroups = computed(() =>
  (['instructor', 'student'] as const)
    .map((role) => ({
      label: role === 'instructor' ? 'Instructors' : 'Students',
      items: users.value.filter((user) => user.role === role),
    }))
    .filter((group) => group.items.length),
)

onMounted(async () => {
  window.addEventListener('hashchange', onHash)
  try {
    users.value = await parseResponse(client.api.users.$get())
  } catch (error) {
    loadError.value = messageOf(error)
    return
  }
  // A remembered user that no longer exists (e.g. after a reseed) falls back to the first one.
  if (!users.value.some((user) => user.id === currentUserId.value))
    currentUserId.value = users.value[0].id
})
onUnmounted(() => window.removeEventListener('hashchange', onHash))

// Links fill the header's height so the active underline sits on its bottom edge. A transparent top
// border of the same width balances it, keeping the text on the header's center line.
const navLink = (active: boolean) =>
  active ? 'border-b-accent font-medium text-ink' : 'border-b-transparent text-muted hover:text-ink'
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-line bg-panel/90 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
      <a href="#" class="flex items-center gap-2" aria-label="Gloss, all readings">
        <span
          class="grid size-8 place-items-center rounded-lg bg-accent text-white"
          aria-hidden="true"
        >
          <i class="pi pi-book" />
        </span>
        <span class="font-serif text-xl font-semibold">Gloss</span>
      </a>
      <nav
        v-if="currentUser?.role === 'instructor'"
        class="hidden h-full gap-5 text-sm sm:flex"
        aria-label="Main"
      >
        <a
          href="#"
          class="flex items-center border-y-2 border-t-transparent"
          :class="navLink(!onParticipation && !readingId)"
          :aria-current="!onParticipation && !readingId ? 'page' : undefined"
        >
          Readings
        </a>
        <a
          href="#/participation"
          class="flex items-center border-y-2 border-t-transparent"
          :class="navLink(onParticipation)"
          :aria-current="onParticipation ? 'page' : undefined"
        >
          Participation
        </a>
      </nav>
      <div v-if="users.length" class="ml-auto flex items-center gap-2">
        <label for="viewing-as" class="hidden text-sm text-muted md:block">Viewing as</label>
        <Select
          v-model="currentUserId"
          input-id="viewing-as"
          :options="userGroups"
          option-group-label="label"
          option-group-children="items"
          option-label="name"
          option-value="id"
          class="w-44 sm:w-60"
        >
          <template #value>
            <span v-if="currentUser" class="flex items-center gap-2">
              <UserAvatar :id="currentUser.id" :name="currentUser.name" />
              <span class="truncate">{{ currentUser.name }}</span>
            </span>
          </template>
          <template #option="{ option }">
            <span class="flex items-center gap-2">
              <UserAvatar :id="option.id" :name="option.name" />
              {{ option.name }}
            </span>
          </template>
        </Select>
      </div>
    </div>
  </header>

  <main>
    <div v-if="loadError" class="mx-auto max-w-3xl px-4 py-8">
      <Message severity="error" icon="pi pi-exclamation-circle">
        Couldn't load the app: {{ loadError }}
      </Message>
    </div>
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
      <ReadingListView
        v-else
        :key="`readings:${currentUser.id}`"
        :can-create="currentUser.role === 'instructor'"
      />
    </template>
    <p v-else class="mx-auto max-w-3xl px-4 py-8 text-muted" role="status">Loading…</p>
  </main>

  <Toast position="bottom-right" />
  <ConfirmDialog :style="{ width: '28rem' }" :breakpoints="{ '640px': '95vw' }" />
</template>
