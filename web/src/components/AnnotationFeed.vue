<script setup lang="ts">
import { computed, ref } from 'vue'
import AnnotationPost from './AnnotationPost.vue'
import { useAnnotations } from '@/composables/useAnnotations'

/** Students post; instructors read. */
defineProps<{ canPost: boolean }>()
const { roots, repliesOf, total, authors, loading, busy, create, reply } = useAnnotations()

/** Instructors can narrow the feed to one student ('' = everyone). */
const studentFilter = ref('')
/** Threads the student took part in, as the opening comment or a reply. Shown whole, for context. */
const visibleRoots = computed(() => {
  const id = studentFilter.value
  if (!id) return roots.value
  return roots.value.filter(
    (root) => root.authorId === id || repliesOf(root.id).some((reply) => reply.authorId === id),
  )
})

const draft = ref('')
const draftError = ref('')
const replyingTo = ref<string | null>(null)
const replyDraft = ref('')
const replyError = ref('')

async function post() {
  draftError.value = (await create(draft.value)) ?? ''
  if (!draftError.value) draft.value = ''
}
function startReply(rootId: string) {
  replyingTo.value = rootId
  replyDraft.value = ''
  replyError.value = ''
}
async function sendReply(rootId: string) {
  replyError.value = (await reply(rootId, replyDraft.value)) ?? ''
  if (!replyError.value) replyingTo.value = null
}
</script>

<template>
  <section class="rounded-lg border border-line bg-panel p-3.5">
    <div class="mb-2 flex items-center gap-2">
      <h3 class="flex-1 text-sm font-semibold tracking-wide text-muted uppercase">
        Discussion<template v-if="!loading"> ({{ total }})</template>
      </h3>
      <label v-if="!canPost && authors.length" class="flex items-center gap-2 text-sm text-muted">
        Student
        <select v-model="studentFilter" class="field w-auto py-1 text-sm">
          <option value="">All students</option>
          <option v-for="author in authors" :key="author.id" :value="author.id">
            {{ author.name }} ({{ author.count }})
          </option>
        </select>
      </label>
    </div>

    <form v-if="canPost" class="mb-2" @submit.prevent="post">
      <textarea v-model="draft" class="field" rows="3" placeholder="Add an annotation…" />
      <p v-if="draftError" class="mt-1 text-sm text-red-600 dark:text-red-400">{{ draftError }}</p>
      <div class="mt-1.5 flex justify-end">
        <button type="submit" class="btn btn-primary" :disabled="busy || !draft.trim()">
          Post
        </button>
      </div>
    </form>

    <p v-if="loading" class="text-sm text-muted" role="status">Loading discussion…</p>
    <p v-else-if="!roots.length" class="text-sm text-muted">
      {{
        canPost
          ? 'No annotations yet. Start the discussion.'
          : 'No students have annotated this reading yet.'
      }}
    </p>
    <p v-else-if="!visibleRoots.length" class="text-sm text-muted">
      No annotations from this student.
    </p>

    <div v-for="root in visibleRoots" :key="root.id" class="border-t border-line py-2.5">
      <AnnotationPost :post="root" :highlight="root.authorId === studentFilter" />
      <div v-if="repliesOf(root.id).length" class="ml-3.5 border-l-2 border-line pl-2.5">
        <AnnotationPost
          v-for="reply in repliesOf(root.id)"
          :key="reply.id"
          :post="reply"
          :highlight="reply.authorId === studentFilter"
        />
      </div>
      <template v-if="canPost">
        <form
          v-if="replyingTo === root.id"
          class="mt-1 ml-3.5 border-l-2 border-line pl-2.5"
          @submit.prevent="sendReply(root.id)"
        >
          <textarea v-model="replyDraft" class="field" rows="2" placeholder="Reply…" />
          <p v-if="replyError" class="mt-1 text-sm text-red-600 dark:text-red-400">
            {{ replyError }}
          </p>
          <div class="mt-1.5 flex justify-end gap-2">
            <button type="button" class="btn" @click="replyingTo = null">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="busy || !replyDraft.trim()">
              Reply
            </button>
          </div>
        </form>
        <button
          v-else
          class="cursor-pointer py-0.5 text-sm text-accent hover:underline"
          @click="startReply(root.id)"
        >
          Reply
        </button>
      </template>
    </div>
  </section>
</template>
