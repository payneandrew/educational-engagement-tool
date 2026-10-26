<script setup lang="ts">
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, onMounted, ref } from 'vue'
import { client, messageOf, parseResponse, type Participation } from '@/api/client'
import UserAvatar from '@/components/UserAvatar.vue'
import { downloadCsv } from '@/utils/csv'
import { oneDecimal, plural } from '@/utils/format'
import { HEAT_BINS, heatBin } from '@/utils/heat'
import { classAverage, participationRows } from '@/utils/participation'

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

/** The class average row (see utils/participation.ts). */
const average = computed(() => classAverage(data.value ?? { readings: [], students: [] }))

/** The table as a file: the same columns and numbers, in the order shown on load (by name). */
function download() {
  if (!data.value) return
  downloadCsv(
    `participation-${new Date().toLocaleDateString('en-CA')}.csv`,
    participationRows(data.value),
  )
}

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

      <div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <!-- Scale legend for the shaded cells; the numbers in them carry the same information. -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>Annotations per reading</span>
          <span class="flex items-center gap-1.5">
            <span class="size-4 rounded-sm ring-1 ring-line" aria-hidden="true" />none
          </span>
          <span v-for="bin in HEAT_BINS" :key="bin.label" class="flex items-center gap-1.5">
            <span class="size-4 rounded-sm" :class="bin.swatch" aria-hidden="true" />{{ bin.label }}
          </span>
        </div>
        <Button
          label="Download CSV"
          icon="pi pi-download"
          severity="secondary"
          outlined
          size="small"
          @click="download"
        />
      </div>

      <div class="overflow-hidden rounded-xl border border-line">
        <DataTable
          :value="rows"
          data-key="id"
          scrollable
          sort-field="name"
          :sort-order="1"
          removable-sort
          table-class="text-sm"
          aria-label="Annotations per student per reading"
        >
          <!-- Student, total and coverage stay on the left (the student column is frozen when
               scrolling sideways), so the summary is always visible however many readings there are.
               A frozen cell must be opaque or the cells scrolling under it show through; PrimeVue gives
               the header and body cells a background but not the footer's, hence footer-class. -->
          <Column
            field="name"
            header="Student"
            sortable
            frozen
            class="min-w-52"
            body-class="py-1"
            footer-class="bg-panel"
          >
            <template #body="{ data: student }">
              <span class="flex items-center gap-2.5 font-medium">
                <UserAvatar :id="student.id" :name="student.name" />
                {{ student.name }}
              </span>
            </template>
            <template #footer>Class average</template>
          </Column>
          <Column
            field="total"
            header="Total"
            sortable
            class="text-center font-semibold tabular-nums"
          >
            <template #footer>{{ oneDecimal(average.total) }}</template>
          </Column>
          <Column field="readingsParticipated" header="Readings" sortable class="min-w-28">
            <template #body="{ data: student }">
              <span :class="student.readingsParticipated === 0 && 'text-amber-700'">
                {{ student.readingsParticipated }} of {{ data.readings.length }}
              </span>
            </template>
            <template #footer>
              {{ oneDecimal(average.readingsParticipated) }} of {{ data.readings.length }}
            </template>
          </Column>
          <Column
            v-for="(reading, index) in data.readings"
            :key="reading.id"
            :field="`r${index}`"
            sortable
            class="min-w-36 text-center"
            header-class="px-2"
            body-class="p-px"
          >
            <template #header>
              <a
                :href="`#/reading/${reading.id}`"
                class="line-clamp-2 text-left font-semibold wrap-anywhere text-accent hover:underline"
                :title="reading.title"
              >
                {{ reading.title }}
              </a>
            </template>
            <template #body="{ data: student }">
              <!-- A heat cell: the shade is the count's step, the number stays readable. 2px of
                   surface between cells (not a border) keeps neighbors distinct. -->
              <div
                v-tooltip.top="`${student.name}: ${plural(student[`r${index}`], 'annotation')}`"
                class="grid h-9 place-items-center rounded font-medium tabular-nums transition hover:ring-2 hover:ring-white/70 hover:ring-inset"
                :class="heatBin(student[`r${index}`])?.cell ?? 'hover:bg-slate-100'"
              >
                <template v-if="student[`r${index}`]">{{ student[`r${index}`] }}</template>
                <span v-else class="text-muted" aria-label="none">–</span>
              </div>
            </template>
            <template #footer>{{ oneDecimal(average.perReading[index] ?? 0) }}</template>
          </Column>
        </DataTable>
      </div>
    </template>
  </div>
</template>
