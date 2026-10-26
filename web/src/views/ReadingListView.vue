<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, ref } from 'vue'
import { client, messageOf, unwrap, type Reading } from '@/api/client'
import { formatDate, plural } from '@/utils/format'
import { titleMatches } from '@/utils/search'

const props = defineProps<{ canCreate: boolean }>()
const toast = useToast()

const readings = ref<Reading[] | null>(null)
const loadError = ref('')

const search = ref('')
const matchingReadings = computed(
  () => readings.value?.filter((reading) => titleMatches(reading.title, search.value)) ?? [],
)

onMounted(async () => {
  try {
    readings.value = await unwrap(await client.api.readings.$get())
  } catch (error) {
    loadError.value = messageOf(error)
  }
})

// "New reading" dialog (instructors).
const dialogOpen = ref(false)
const title = ref('')
const description = ref('')
const busy = ref(false)
const formError = ref('')

function openDialog() {
  formError.value = ''
  dialogOpen.value = true
}

async function create() {
  busy.value = true
  formError.value = ''
  try {
    const created = await unwrap(
      await client.api.readings.$post({
        json: { title: title.value, description: description.value },
      }),
    )
    readings.value = [created, ...(readings.value ?? [])] // the list is newest first
    search.value = '' // so the new reading isn't hidden by an old search
    title.value = ''
    description.value = ''
    dialogOpen.value = false
    toast.add({
      severity: 'success',
      summary: 'Reading assigned',
      detail: `Students can now discuss “${created.title}”.`,
      life: 4000,
    })
  } catch (error) {
    formError.value = messageOf(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
    <div class="mb-6 flex flex-wrap items-end gap-4">
      <div class="flex-1">
        <h1 class="text-2xl font-semibold">Readings</h1>
        <p class="text-muted">
          {{
            props.canCreate
              ? 'Assign readings and follow how each discussion is going.'
              : 'Your assigned readings. Open one to join its discussion.'
          }}
        </p>
      </div>
      <Button v-if="props.canCreate" label="New reading" icon="pi pi-plus" @click="openDialog" />
    </div>

    <Message v-if="loadError" severity="error" icon="pi pi-exclamation-circle">
      {{ loadError }}
    </Message>

    <div v-else-if="!readings" class="grid gap-3" role="status" aria-label="Loading readings">
      <Skeleton v-for="n in 3" :key="n" height="7.5rem" border-radius="0.75rem" />
    </div>

    <div
      v-else-if="!readings.length"
      class="rounded-xl border border-dashed border-line py-14 text-center"
    >
      <i class="pi pi-book text-3xl text-muted" aria-hidden="true" />
      <p class="mt-3 font-medium">No readings yet</p>
      <p class="text-sm text-muted">
        {{
          canCreate
            ? 'Create your first reading to get students annotating.'
            : 'Your instructor hasn’t assigned any readings yet.'
        }}
      </p>
      <Button
        v-if="canCreate"
        label="New reading"
        icon="pi pi-plus"
        class="mt-4"
        @click="openDialog"
      />
    </div>

    <template v-else>
      <IconField class="mb-4">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          type="search"
          fluid
          placeholder="Search readings by title"
          aria-label="Search readings by title"
        />
      </IconField>

      <p v-if="!matchingReadings.length" class="py-8 text-center text-muted">
        No readings match “{{ search.trim() }}”.
        <Button label="Clear search" link class="p-0" @click="search = ''" />
      </p>

      <ul class="grid gap-3">
        <li v-for="reading in matchingReadings" :key="reading.id">
          <a
            :href="`#/reading/${reading.id}`"
            class="group block rounded-xl border border-line bg-panel px-5 py-4 transition hover:border-accent hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <h2 class="font-serif text-lg font-semibold group-hover:text-accent">
              {{ reading.title }}
            </h2>
            <p class="mt-1 line-clamp-2 text-muted">{{ reading.description }}</p>
            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span class="text-muted">
                {{ reading.createdByName }} · {{ formatDate(reading.createdAt) }}
              </span>
              <span class="ml-auto flex items-center gap-1.5 font-medium">
                <i class="pi pi-comments text-muted" aria-hidden="true" />
                {{ plural(reading.annotationCount, 'annotation') }}
              </span>
              <span v-if="canCreate" class="flex items-center gap-1.5 font-medium">
                <i class="pi pi-users text-muted" aria-hidden="true" />
                {{ plural(reading.studentCount, 'student') }}
              </span>
            </div>
          </a>
        </li>
      </ul>
    </template>

    <Dialog
      v-model:visible="dialogOpen"
      modal
      header="New reading"
      :style="{ width: '34rem' }"
      :breakpoints="{ '640px': '95vw' }"
    >
      <form id="new-reading" class="grid gap-4" @submit.prevent="create">
        <div class="grid gap-1.5">
          <label for="reading-title" class="text-sm font-medium">Title</label>
          <InputText
            id="reading-title"
            v-model="title"
            maxlength="200"
            placeholder="e.g. Mill — On Liberty, Chapter 2"
            autofocus
          />
        </div>
        <div class="grid gap-1.5">
          <label for="reading-description" class="text-sm font-medium">Description</label>
          <Textarea
            id="reading-description"
            v-model="description"
            rows="5"
            auto-resize
            maxlength="5000"
            placeholder="What should students read, and what should they focus on?"
          />
        </div>
        <Message v-if="formError" severity="error" size="small">{{ formError }}</Message>
      </form>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="dialogOpen = false" />
        <Button
          type="submit"
          form="new-reading"
          label="Create reading"
          :loading="busy"
          :disabled="!title.trim() || !description.trim()"
        />
      </template>
    </Dialog>
  </div>
</template>
