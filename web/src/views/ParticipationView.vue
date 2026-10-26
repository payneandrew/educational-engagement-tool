<script setup lang="ts">
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, onMounted, ref } from 'vue'
import { client, messageOf, parseResponse, type Participation } from '@/api/client'
import UserAvatar from '@/components/UserAvatar.vue'
import { plural } from '@/utils/format'

const data = ref<Participation | null>(null)
const loadError = ref('')

onMounted(async () => {
  try {
    data.value = await parseResponse(client.api.participation.$get())
  } catch (e) {
    loadError.value = messageOf(e)
  }
})

/** One flat row per student (DataTable sorts by field), with a `r<index>` count per reading. */
const rows = computed(
  () =>
    data.value?.students.map((student) => ({
      ...student,
      ...Object.fromEntries(student.perReading.map((count, index) => [`r${index}`, count])),
    })) ?? [],
)

/** Students with no annotations anywhere: the ones an instructor most needs to notice. */
const notStarted = computed(
  () => data.value?.students.filter((student) => student.total === 0) ?? [],
)
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <h1 class="text-2xl font-semibold">Participation</h1>
    <p class="mb-6 text-muted">
      Annotations (replies included) by each student on each reading. Select a column to sort.
    </p>

    <Message v-if="loadError" severity="error" icon="pi pi-exclamation-circle">
      {{ loadError }}
    </Message>
    <Skeleton v-else-if="!data" height="24rem" border-radius="0.75rem" />
    <p v-else-if="!data.students.length" class="text-muted">No students yet.</p>
    <p v-else-if="!data.readings.length" class="text-muted">
      No readings yet. Create one from the Readings page.
    </p>
    <template v-else>
      <Message v-if="notStarted.length" severity="warn" icon="pi pi-flag" class="mb-4">
        {{ plural(notStarted.length, 'student') }}
        {{ notStarted.length === 1 ? 'hasn’t' : 'haven’t' }} annotated any reading yet:
        {{ notStarted.map((student) => student.name).join(', ') }}.
      </Message>

      <div class="overflow-hidden rounded-xl border border-line">
        <DataTable
          :value="rows"
          data-key="id"
          scrollable
          sort-field="name"
          :sort-order="1"
          removable-sort
          striped-rows
          table-class="text-sm"
          aria-label="Annotations per student per reading"
        >
          <!-- Student, total and coverage stay on the left (the student column is frozen when
               scrolling sideways), so the summary is always visible however many readings there are. -->
          <Column field="name" header="Student" sortable frozen class="min-w-52">
            <template #body="{ data: student }">
              <span class="flex items-center gap-2.5 font-medium">
                <UserAvatar :id="student.id" :name="student.name" />
                {{ student.name }}
              </span>
            </template>
          </Column>
          <Column
            field="total"
            header="Total"
            sortable
            class="text-center font-semibold tabular-nums"
          />
          <Column field="readingsParticipated" header="Readings" sortable class="min-w-28">
            <template #body="{ data: student }">
              <span :class="student.readingsParticipated === 0 && 'text-amber-700'">
                {{ student.readingsParticipated }} of {{ data.readings.length }}
              </span>
            </template>
          </Column>
          <Column
            v-for="(reading, index) in data.readings"
            :key="reading.id"
            :field="`r${index}`"
            sortable
            class="min-w-36 text-center tabular-nums"
          >
            <template #header>
              <a
                :href="`#/reading/${reading.id}`"
                class="line-clamp-2 text-left font-semibold text-accent hover:underline"
                :title="reading.title"
              >
                {{ reading.title }}
              </a>
            </template>
            <template #body="{ data: student }">
              <span v-if="student[`r${index}`]">{{ student[`r${index}`] }}</span>
              <span v-else class="text-amber-700" aria-label="none">–</span>
            </template>
          </Column>
        </DataTable>
      </div>
    </template>
  </div>
</template>
