<script setup lang="ts">
import { ref } from 'vue'
import type { Annotation, FeedActions } from './api'
import AnnotationPost from './AnnotationPost.vue'

const props = defineProps<{
  /** Already sorted newest first. */
  roots: Annotation[]
  repliesOf: (rootId: string) => Annotation[]
  /** Roots + replies. */
  total: number
  me: string
  /** Students post; instructors read. */
  canPost: boolean
  busy: boolean
  error: string
  actions: FeedActions
}>()

const draft = ref('')
const replyingTo = ref<string | null>(null)
const replyDraft = ref('')

async function post() {
  if (await props.actions.create(draft.value)) draft.value = ''
}
function startReply(rootId: string) {
  replyingTo.value = rootId
  replyDraft.value = ''
}
async function sendReply(rootId: string) {
  if (await props.actions.reply(rootId, replyDraft.value)) replyingTo.value = null
}
</script>

<template>
  <section class="discussion">
    <h3>Discussion ({{ total }})</h3>

    <form v-if="canPost" class="composer" @submit.prevent="post">
      <textarea v-model="draft" rows="3" placeholder="Add an annotation…" />
      <div class="row end">
        <button class="primary" type="submit" :disabled="busy || !draft.trim()">Post</button>
      </div>
    </form>
    <div class="err">{{ error }}</div>

    <p v-if="!roots.length" class="empty">
      {{
        canPost
          ? 'No annotations yet. Start the discussion.'
          : 'No students have annotated this reading yet.'
      }}
    </p>

    <div v-for="root in roots" :key="root.id" class="thread">
      <AnnotationPost :post="root" :me="me" :busy="busy" :actions="actions" />
      <div class="replies">
        <AnnotationPost
          v-for="r in repliesOf(root.id)"
          :key="r.id"
          :post="r"
          :me="me"
          :busy="busy"
          :actions="actions"
        />
      </div>
      <template v-if="canPost">
        <form v-if="replyingTo === root.id" class="replies" @submit.prevent="sendReply(root.id)">
          <textarea v-model="replyDraft" rows="2" placeholder="Reply…" />
          <div class="row end">
            <button type="button" @click="replyingTo = null">Cancel</button>
            <button class="primary" type="submit" :disabled="busy || !replyDraft.trim()">
              Reply
            </button>
          </div>
        </form>
        <button v-else class="link" @click="startReply(root.id)">Reply</button>
      </template>
    </div>
  </section>
</template>
