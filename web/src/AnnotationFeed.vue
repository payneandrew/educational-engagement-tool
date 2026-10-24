<script setup lang="ts">
import { ref } from 'vue'
import AnnotationPost from './AnnotationPost.vue'
import { useAnnotations } from './useAnnotations'

/** Students post; instructors read. */
defineProps<{ canPost: boolean }>()
const { roots, repliesOf, total, busy, create, reply } = useAnnotations()

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
    <h3 class="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
      Discussion ({{ total }})
    </h3>

    <form v-if="canPost" class="mb-2" @submit.prevent="post">
      <textarea v-model="draft" class="field" rows="3" placeholder="Add an annotation…" />
      <p v-if="draftError" class="mt-1 text-sm text-red-600 dark:text-red-400">{{ draftError }}</p>
      <div class="mt-1.5 flex justify-end">
        <button type="submit" class="btn btn-primary" :disabled="busy || !draft.trim()">
          Post
        </button>
      </div>
    </form>

    <p v-if="!roots.length" class="text-sm text-muted">
      {{
        canPost
          ? 'No annotations yet. Start the discussion.'
          : 'No students have annotated this reading yet.'
      }}
    </p>

    <div v-for="root in roots" :key="root.id" class="border-t border-line py-2.5">
      <AnnotationPost :post="root" />
      <div v-if="repliesOf(root.id).length" class="ml-3.5 border-l-2 border-line pl-2.5">
        <AnnotationPost v-for="r in repliesOf(root.id)" :key="r.id" :post="r" />
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
