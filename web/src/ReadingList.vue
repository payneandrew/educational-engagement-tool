<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, messageOf, unwrap, type Reading } from './api'
import { plural } from './format'

const props = defineProps<{ canCreate: boolean }>()

const readings = ref<Reading[] | null>(null)
const loadError = ref('')

const formOpen = ref(false)
const title = ref('')
const description = ref('')
const busy = ref(false)
const formError = ref('')
const success = ref('')

onMounted(async () => {
  try {
    readings.value = await unwrap(await client.api.readings.$get())
  } catch (e) {
    loadError.value = messageOf(e)
  }
})

function openForm() {
  formOpen.value = true
  success.value = ''
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
    success.value = `“${created.title}” has been assigned.`
    title.value = ''
    description.value = ''
    formOpen.value = false
  } catch (e) {
    formError.value = messageOf(e)
  } finally {
    busy.value = false
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-5">
    <div class="mb-4 flex items-center">
      <h2 class="flex-1 text-2xl font-bold">Readings</h2>
      <button v-if="props.canCreate && !formOpen" class="btn btn-primary" @click="openForm">
        New reading
      </button>
    </div>

    <p
      v-if="success"
      role="status"
      class="mb-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
    >
      {{ success }}
    </p>

    <form
      v-if="formOpen"
      class="mb-4 grid gap-3 rounded-lg border border-line bg-panel p-4"
      @submit.prevent="create"
    >
      <label class="grid gap-1 text-sm text-muted">
        Title
        <input
          v-model="title"
          class="field text-base"
          maxlength="200"
          placeholder="e.g. Mill — On Liberty, Chapter 2"
          autofocus
        />
      </label>
      <label class="grid gap-1 text-sm text-muted">
        Description
        <textarea
          v-model="description"
          class="field text-base"
          rows="4"
          maxlength="5000"
          placeholder="What should students read, and what should they focus on?"
        />
      </label>
      <p v-if="formError" class="text-sm text-red-600 dark:text-red-400">{{ formError }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn" @click="formOpen = false">Cancel</button>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="busy || !title.trim() || !description.trim()"
        >
          Create reading
        </button>
      </div>
    </form>

    <p v-if="loadError" class="text-sm text-red-600 dark:text-red-400">{{ loadError }}</p>
    <p v-else-if="!readings" class="text-sm text-muted" role="status">Loading readings…</p>
    <p v-else-if="!readings.length" class="text-sm text-muted">
      {{
        canCreate
          ? 'No readings yet. Create one to get your students started.'
          : 'No readings have been assigned yet.'
      }}
    </p>
    <ul v-else class="grid gap-2.5">
      <li v-for="r in readings" :key="r.id">
        <a
          :href="`#/reading/${r.id}`"
          class="grid gap-1 rounded-lg border border-line bg-panel px-4 py-3.5 transition-colors hover:border-accent"
        >
          <strong class="font-semibold">{{ r.title }}</strong>
          <span class="line-clamp-2">{{ r.description }}</span>
          <span class="text-sm text-muted">
            Assigned by {{ r.createdByName }} · {{ fmt(r.createdAt) }} ·
            <span class="font-medium text-ink">{{ plural(r.annotationCount, 'annotation') }}</span>
            <template v-if="canCreate">
              · {{ plural(r.studentCount, 'student') }} participating
            </template>
          </span>
        </a>
      </li>
    </ul>
  </div>
</template>
