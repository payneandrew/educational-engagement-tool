<script setup lang="ts">
import { ref } from 'vue'
import type { Annotation, FeedActions } from './api'

const props = defineProps<{ post: Annotation; me: string; busy: boolean; actions: FeedActions }>()

const editing = ref(false)
const editDraft = ref('')

function startEdit() {
  editDraft.value = props.post.body
  editing.value = true
}
async function saveEdit() {
  if (await props.actions.edit(props.post.id, editDraft.value)) editing.value = false
}
function confirmDelete() {
  const msg =
    props.post.kind === 'root'
      ? 'Delete this annotation and its replies? This can’t be undone.'
      : 'Delete this reply? This can’t be undone.'
  if (window.confirm(msg)) void props.actions.remove(props.post.id)
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="py-1">
    <div class="flex items-center gap-2 text-xs text-muted">
      <strong class="font-semibold">{{ post.authorName }}</strong>
      <time :datetime="post.createdAt">{{ fmt(post.createdAt) }}</time>
      <span v-if="post.editedAt">(edited)</span>
      <template v-if="post.authorId === me && !editing">
        <button data-action="edit" class="btn ml-auto px-1.5 py-0 text-xs" @click="startEdit">
          Edit
        </button>
        <button data-action="delete" class="btn px-1.5 py-0 text-xs" @click="confirmDelete">
          Delete
        </button>
      </template>
    </div>
    <form v-if="editing" class="mt-1" @submit.prevent="saveEdit">
      <textarea v-model="editDraft" class="field" rows="3" />
      <div class="mt-1.5 flex justify-end gap-2">
        <button type="button" class="btn" @click="editing = false">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="busy || !editDraft.trim()">
          Save
        </button>
      </div>
    </form>
    <p v-else class="my-1 whitespace-pre-wrap">{{ post.body }}</p>
  </div>
</template>
