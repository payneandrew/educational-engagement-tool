<script setup lang="ts">
import { ref } from 'vue'
import type { Annotation } from './api'
import { currentUserId } from './session'
import { useAnnotations } from './useAnnotations'

/** `highlight` marks the posts of the student the feed is filtered to. */
const props = defineProps<{ post: Annotation; highlight?: boolean }>()
const { busy, edit, remove } = useAnnotations()

const editing = ref(false)
const editDraft = ref('')
const error = ref('')

function startEdit() {
  editDraft.value = props.post.body
  error.value = ''
  editing.value = true
}
async function saveEdit() {
  error.value = (await edit(props.post.id, editDraft.value)) ?? ''
  if (!error.value) editing.value = false
}
async function confirmDelete() {
  const message =
    props.post.kind === 'root'
      ? 'Delete this annotation and its replies? This can’t be undone.'
      : 'Delete this reply? This can’t be undone.'
  if (window.confirm(message)) error.value = (await remove(props.post.id)) ?? ''
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="py-1" :class="highlight && '-mx-2 rounded-md bg-accent/10 px-2'">
    <div class="flex items-center gap-2 text-xs text-muted">
      <strong class="font-semibold">{{ post.authorName }}</strong>
      <time :datetime="post.createdAt">{{ formatDateTime(post.createdAt) }}</time>
      <span v-if="post.editedAt">(edited)</span>
      <template v-if="post.authorId === currentUserId && !editing">
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
    <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
  </div>
</template>
