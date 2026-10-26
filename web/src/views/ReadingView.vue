<script setup lang="ts">
import AvatarGroup from 'primevue/avatargroup'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, onMounted, ref } from 'vue'
import { client, messageOf, unwrap, type ReadingDetail } from '@/api/client'
import { currentUserId } from '@/api/session'
import AnnotationFeed from '@/components/AnnotationFeed.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { provideAnnotations } from '@/composables/useAnnotations'
import { formatDate } from '@/utils/format'

const props = defineProps<{ readingId: string; canPost: boolean }>()

const reading = ref<ReadingDetail | null>(null)
const loadError = ref('')
// Opens the live connection; AnnotationFeed and AnnotationPost reach it with useAnnotations().
const {
  total,
  studentCount,
  viewers,
  loading,
  loadError: annotationsError,
} = provideAnnotations(props.readingId)

onMounted(async () => {
  try {
    reading.value = await unwrap(
      await client.api.readings[':id'].$get({ param: { id: props.readingId } }),
    )
  } catch (error) {
    loadError.value = messageOf(error)
  }
})

const others = computed(() => viewers.value.filter((viewer) => viewer.id !== currentUserId.value))
/** "Alice Chen and Bob Okafor are also reading": who else has this reading open. */
const othersHere = computed(() => {
  const names = others.value.map((viewer) => viewer.name)
  if (!names.length) return ''
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${list} ${names.length === 1 ? 'is' : 'are'} also reading`
})
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-5 sm:px-6">
    <nav aria-label="Breadcrumb" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <a href="#" class="hover:text-accent hover:underline">Readings</a>
      <i class="pi pi-angle-right text-xs" aria-hidden="true" />
      <span class="truncate text-ink" aria-current="page">{{ reading?.title ?? '…' }}</span>
    </nav>

    <Message v-if="loadError" severity="error" icon="pi pi-exclamation-circle">
      {{
        loadError === 'reading not found' ? 'This reading doesn’t exist or was removed.' : loadError
      }}
      <a href="#" class="ml-1 font-medium underline">Back to readings</a>
    </Message>

    <div v-else class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <!-- The reading, set like a document. -->
      <div class="grid gap-4">
        <article class="rounded-xl border border-line bg-panel px-6 py-7 sm:px-10 sm:py-9">
          <template v-if="reading">
            <h1 class="font-serif text-3xl leading-tight font-semibold text-balance">
              {{ reading.title }}
            </h1>
            <p class="mt-2 text-sm text-muted">
              Assigned by {{ reading.createdByName }} · {{ formatDate(reading.createdAt) }}
            </p>
            <p class="mt-6 font-serif text-lg leading-8 whitespace-pre-wrap">
              {{ reading.description }}
            </p>
          </template>
          <div v-else class="grid gap-3" role="status" aria-label="Loading reading">
            <Skeleton height="2.25rem" width="80%" />
            <Skeleton width="40%" />
            <Skeleton height="6rem" class="mt-4" />
          </div>
        </article>

        <p v-if="othersHere" class="flex items-center gap-3 text-sm text-muted">
          <AvatarGroup>
            <UserAvatar
              v-for="viewer in others.slice(0, 4)"
              :id="viewer.id"
              :key="viewer.id"
              :name="viewer.name"
            />
          </AvatarGroup>
          <span>
            <span class="mr-1 inline-block size-2 rounded-full bg-green-500" aria-hidden="true" />
            {{ othersHere }}
          </span>
        </p>

        <!-- Instructor overview: counts come from the live feed, so they update as students post. -->
        <dl v-if="!canPost" class="grid grid-cols-2 gap-4">
          <div class="rounded-xl border border-line bg-panel px-5 py-4">
            <dt class="text-sm text-muted">Annotations</dt>
            <dd class="mt-1 text-3xl font-semibold tabular-nums">{{ loading ? '–' : total }}</dd>
          </div>
          <div class="rounded-xl border border-line bg-panel px-5 py-4">
            <dt class="text-sm text-muted">Students participating</dt>
            <dd class="mt-1 text-3xl font-semibold tabular-nums">
              {{ loading ? '–' : studentCount }}
            </dd>
          </div>
        </dl>

        <Message v-if="annotationsError" severity="error">{{ annotationsError }}</Message>
      </div>

      <AnnotationFeed :can-post="canPost" />
    </div>
  </div>
</template>
