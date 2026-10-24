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
  <div class="post">
    <div class="meta">
      <strong>{{ post.authorName }}</strong>
      <time :datetime="post.createdAt">{{ fmt(post.createdAt) }}</time>
      <span v-if="post.editedAt">(edited)</span>
      <span class="spacer" />
      <template v-if="post.authorId === me && !editing">
        <button data-action="edit" @click="startEdit">Edit</button>
        <button data-action="delete" @click="confirmDelete">Delete</button>
      </template>
    </div>
    <form v-if="editing" @submit.prevent="saveEdit">
      <textarea v-model="editDraft" rows="3" />
      <div class="row end">
        <button type="button" @click="editing = false">Cancel</button>
        <button class="primary" type="submit" :disabled="busy || !editDraft.trim()">Save</button>
      </div>
    </form>
    <p v-else>{{ post.body }}</p>
  </div>
</template>
