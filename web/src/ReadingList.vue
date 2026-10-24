<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, unwrap, type Reading } from './api'
import { plural } from './format'

const props = defineProps<{ canCreate: boolean; nameOf: (userId: string) => string }>()

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
    loadError.value = (e as Error).message
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
    formError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
</script>

<template>
  <div class="page narrow">
    <div class="row">
      <h2 class="spacer">Readings</h2>
      <button v-if="props.canCreate && !formOpen" class="primary" @click="openForm">
        New reading
      </button>
    </div>

    <p v-if="success" class="success" role="status">{{ success }}</p>

    <form v-if="formOpen" class="card form" @submit.prevent="create">
      <label>
        Title
        <input
          v-model="title"
          maxlength="200"
          placeholder="e.g. Mill — On Liberty, Chapter 2"
          autofocus
        />
      </label>
      <label>
        Description
        <textarea
          v-model="description"
          rows="4"
          maxlength="5000"
          placeholder="What should students read, and what should they focus on?"
        />
      </label>
      <div class="err">{{ formError }}</div>
      <div class="row end">
        <button type="button" @click="formOpen = false">Cancel</button>
        <button
          class="primary"
          type="submit"
          :disabled="busy || !title.trim() || !description.trim()"
        >
          Create reading
        </button>
      </div>
    </form>

    <p v-if="loadError" class="err">{{ loadError }}</p>
    <p v-else-if="readings && !readings.length" class="empty">
      {{
        canCreate
          ? 'No readings yet. Create one to get your students started.'
          : 'No readings have been assigned yet.'
      }}
    </p>
    <ul v-else class="doc-list">
      <li v-for="r in readings" :key="r.id">
        <a :href="`#/doc/${r.id}`">
          <strong>{{ r.title }}</strong>
          <span class="desc">{{ r.description }}</span>
          <small>
            Assigned by {{ nameOf(r.createdBy) }} · {{ fmt(r.createdAt) }} ·
            <span class="count">{{ plural(r.annotationCount, 'annotation') }}</span>
            <template v-if="canCreate">
              · {{ plural(r.studentCount, 'student') }} participating</template
            >
          </small>
        </a>
      </li>
    </ul>
  </div>
</template>
