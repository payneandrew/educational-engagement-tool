<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, ref } from 'vue'
import { useAnnotations } from '@/composables/useAnnotations'
import { plural } from '@/utils/format'
import AnnotationPost from './AnnotationPost.vue'

/** Students post; instructors read (and can narrow the feed to one student). */
defineProps<{ canPost: boolean }>()
const {
  roots,
  repliesOf,
  total,
  authors,
  loading,
  busy,
  create,
  reply,
  connectionLost,
  announcement,
} = useAnnotations()
const toast = useToast()

/** Instructors can narrow the feed to one student. ('' would read as "no selection" to the Select.) */
const ALL = 'all'
const studentFilter = ref(ALL)
const studentOptions = computed(() => [
  { label: 'All students', value: ALL },
  ...authors.value.map((author) => ({
    label: `${author.name} (${author.count})`,
    value: author.id,
  })),
])
/** Threads the student took part in, as the opening comment or a reply. Shown whole, for context. */
const visibleRoots = computed(() => {
  const id = studentFilter.value
  if (id === ALL) return roots.value
  return roots.value.filter(
    (root) => root.authorId === id || repliesOf(root.id).some((reply) => reply.authorId === id),
  )
})

const draft = ref('')
const draftError = ref('')
const replyingTo = ref<string | null>(null)
const replyDraft = ref('')
const replyError = ref('')
const replyBox = ref<{ $el: HTMLTextAreaElement }[]>([])

async function post() {
  if (!draft.value.trim() || busy.value) return
  draftError.value = (await create(draft.value)) ?? ''
  if (draftError.value) return
  draft.value = ''
  toast.add({ severity: 'success', summary: 'Annotation posted', life: 2500 })
}
async function startReply(rootId: string) {
  replyingTo.value = rootId
  replyDraft.value = ''
  replyError.value = ''
  await nextTick()
  replyBox.value[0]?.$el.focus() // move focus to the box the button just opened
}
async function sendReply(rootId: string) {
  if (!replyDraft.value.trim() || busy.value) return
  replyError.value = (await reply(rootId, replyDraft.value)) ?? ''
  if (replyError.value) return
  replyingTo.value = null
  toast.add({ severity: 'success', summary: 'Reply posted', life: 2500 })
}
</script>

<template>
  <section
    class="flex flex-col rounded-xl border border-line bg-panel lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)]"
    aria-labelledby="discussion-heading"
  >
    <header class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <h2 id="discussion-heading" class="flex-1 font-semibold">
        Discussion
        <span v-if="!loading" class="font-normal text-muted">· {{ plural(total, 'post') }}</span>
      </h2>
      <Select
        v-if="!canPost && authors.length"
        v-model="studentFilter"
        :options="studentOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="w-52"
        aria-label="Show posts from"
      />
    </header>

    <!-- Live arrivals, read out by screen readers. -->
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>

    <Message v-if="connectionLost" severity="warn" class="mx-4 mt-3" icon="pi pi-wifi">
      Connection lost. Reconnecting; new posts may be delayed.
    </Message>

    <form v-if="canPost" class="grid gap-2 border-b border-line p-4" @submit.prevent="post">
      <label for="new-annotation" class="sr-only">Add an annotation</label>
      <Textarea
        id="new-annotation"
        v-model="draft"
        auto-resize
        rows="3"
        maxlength="5000"
        placeholder="Share a question, connection or idea about this reading…"
        @keydown.meta.enter.prevent="post"
        @keydown.ctrl.enter.prevent="post"
      />
      <p v-if="draftError" class="text-sm text-red-600" role="alert">
        {{ draftError }}
      </p>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-muted">⌘/Ctrl + Enter to post</span>
        <Button
          type="submit"
          label="Post"
          icon="pi pi-send"
          size="small"
          :loading="busy"
          :disabled="!draft.trim()"
        />
      </div>
    </form>

    <div class="min-h-0 flex-1 overflow-y-auto px-4">
      <p v-if="loading" class="py-6 text-center text-sm text-muted" role="status">
        Loading discussion…
      </p>
      <div v-else-if="!roots.length" class="py-10 text-center">
        <i class="pi pi-comments text-3xl text-muted" aria-hidden="true" />
        <p class="mt-2 font-medium">No annotations yet</p>
        <p class="text-sm text-muted">
          {{
            canPost
              ? 'Start the discussion: what stood out to you?'
              : 'Students’ annotations will appear here as they post.'
          }}
        </p>
      </div>
      <p v-else-if="!visibleRoots.length" class="py-6 text-center text-sm text-muted">
        No posts from this student on this reading.
      </p>

      <ol class="divide-y divide-line">
        <li v-for="root in visibleRoots" :key="root.id" class="py-3">
          <AnnotationPost :post="root" :highlight="root.authorId === studentFilter" />
          <ol v-if="repliesOf(root.id).length" class="ml-4 border-l-2 border-line pl-4">
            <li v-for="item in repliesOf(root.id)" :key="item.id">
              <AnnotationPost :post="item" :highlight="item.authorId === studentFilter" />
            </li>
          </ol>
          <template v-if="canPost">
            <form
              v-if="replyingTo === root.id"
              class="mt-1 ml-4 grid gap-2 border-l-2 border-line pl-4"
              @submit.prevent="sendReply(root.id)"
            >
              <Textarea
                ref="replyBox"
                v-model="replyDraft"
                auto-resize
                rows="2"
                maxlength="5000"
                :aria-label="`Reply to ${root.authorName}`"
                placeholder="Write a reply…"
                @keydown.meta.enter.prevent="sendReply(root.id)"
                @keydown.ctrl.enter.prevent="sendReply(root.id)"
                @keydown.esc="replyingTo = null"
              />
              <p v-if="replyError" class="text-sm text-red-600" role="alert">
                {{ replyError }}
              </p>
              <div class="flex justify-end gap-2">
                <Button
                  label="Cancel"
                  severity="secondary"
                  text
                  size="small"
                  @click="replyingTo = null"
                />
                <Button
                  type="submit"
                  label="Reply"
                  size="small"
                  :loading="busy"
                  :disabled="!replyDraft.trim()"
                />
              </div>
            </form>
            <Button
              v-else
              label="Reply"
              icon="pi pi-reply"
              text
              size="small"
              class="ml-9"
              @click="startReply(root.id)"
            />
          </template>
        </li>
      </ol>
    </div>
  </section>
</template>
