<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { client, messageOf, unwrap, type Participation } from '@/api/client'
import { plural } from '@/utils/format'

const data = ref<Participation | null>(null)
const loadError = ref('')

onMounted(async () => {
  try {
    data.value = await unwrap(await client.api.participation.$get())
  } catch (e) {
    loadError.value = messageOf(e)
  }
})

/** Students with no annotations anywhere: the ones an instructor most needs to notice. */
const notStarted = computed(
  () => data.value?.students.filter((student) => student.total === 0) ?? [],
)
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-5">
    <h2 class="text-2xl font-bold">Participation</h2>
    <p class="mb-4 text-sm text-muted">
      Annotations (replies included) by each student on each reading.
    </p>

    <p v-if="loadError" class="text-sm text-red-600 dark:text-red-400">{{ loadError }}</p>
    <p v-else-if="!data" class="text-sm text-muted" role="status">Loading participation…</p>
    <p v-else-if="!data.students.length" class="text-sm text-muted">No students yet.</p>
    <p v-else-if="!data.readings.length" class="text-sm text-muted">
      No readings yet. Create one from the Readings page.
    </p>
    <template v-else>
      <p
        v-if="notStarted.length"
        class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        {{ plural(notStarted.length, 'student') }}
        {{ notStarted.length === 1 ? 'hasn’t' : 'haven’t' }} annotated any reading yet:
        {{ notStarted.map((student) => student.name).join(', ') }}.
      </p>

      <!-- Scrolls sideways on narrow screens; the student column stays put. -->
      <div class="overflow-x-auto rounded-lg border border-line bg-panel">
        <table class="w-full border-collapse text-sm">
          <caption class="sr-only">
            Annotations per student per reading
          </caption>
          <thead>
            <tr class="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
              <th scope="col" class="sticky left-0 bg-panel px-3 py-2 font-semibold">Student</th>
              <th
                v-for="reading in data.readings"
                :key="reading.id"
                scope="col"
                class="max-w-40 min-w-32 px-3 py-2 text-center font-semibold normal-case"
              >
                <a
                  :href="`#/reading/${reading.id}`"
                  class="line-clamp-2 text-accent hover:underline"
                >
                  {{ reading.title }}
                </a>
              </th>
              <th scope="col" class="px-3 py-2 text-center font-semibold">Total</th>
              <th scope="col" class="px-3 py-2 text-center font-semibold">Readings</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="student in data.students"
              :key="student.id"
              class="border-b border-line last:border-0"
            >
              <th
                scope="row"
                class="sticky left-0 bg-panel px-3 py-2 text-left font-medium whitespace-nowrap"
              >
                {{ student.name }}
              </th>
              <td
                v-for="(count, index) in student.perReading"
                :key="data.readings[index].id"
                class="px-3 py-2 text-center tabular-nums"
                :class="count === 0 && 'text-amber-700 dark:text-amber-400'"
              >
                {{ count === 0 ? '–' : count }}
              </td>
              <td class="px-3 py-2 text-center font-semibold tabular-nums">{{ student.total }}</td>
              <td class="px-3 py-2 text-center text-muted tabular-nums">
                {{ student.readingsParticipated }} of {{ data.readings.length }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
