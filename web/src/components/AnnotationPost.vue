<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { nextTick, ref } from 'vue'
import type { Annotation } from '@/api/client'
import { currentUserId } from '@/api/session'
import { useAnnotations } from '@/composables/useAnnotations'
import { useNow } from '@/composables/useNow'
import { fullDateTime, relativeTime } from '@/utils/format'
import UserAvatar from './UserAvatar.vue'

/** `highlight` marks the posts of the student the feed is filtered to. */
const props = defineProps<{ post: Annotation; highlight?: boolean }>()
const { busy, edit, remove, newIds } = useAnnotations()
const confirm = useConfirm()
const toast = useToast()
const now = useNow()

const editing = ref(false)
const editDraft = ref('')
const editBox = ref<{ $el: HTMLTextAreaElement }>()
const error = ref('')

async function startEdit() {
  editDraft.value = props.post.body
  error.value = ''
  editing.value = true
  await nextTick()
  // Into the box the button just opened, with the cursor after the text, ready to add to it.
  const box = editBox.value?.$el
  box?.focus()
  box?.setSelectionRange(box.value.length, box.value.length)
}
async function saveEdit() {
  if (editDraft.value.trim() === props.post.body) {
    editing.value = false // nothing changed, so there's nothing to save
    return
  }
  error.value = (await edit(props.post.id, editDraft.value)) ?? ''
  if (error.value) return
  editing.value = false
  toast.add({ severity: 'success', summary: 'Changes saved', life: 2500 })
}
async function deletePost() {
  const isRoot = props.post.kind === 'root'
  const failure = await remove(props.post.id)
  toast.add(
    failure
      ? { severity: 'error', summary: 'Couldn’t delete', detail: failure, life: 5000 }
      : {
          severity: 'success',
          summary: isRoot ? 'Annotation deleted' : 'Reply deleted',
          life: 2500,
        },
  )
}
function confirmDelete() {
  const isRoot = props.post.kind === 'root'
  confirm.require({
    header: isRoot ? 'Delete annotation?' : 'Delete reply?',
    message: isRoot
      ? 'This annotation and all of its replies will be removed for everyone. This can’t be undone.'
      : 'This reply will be removed for everyone. This can’t be undone.',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    // The dialog ignores the return value; deletePost reports its own outcome with a toast.
    accept: () => void deletePost(),
  })
}
</script>

<template>
  <article
    class="flex gap-3 rounded-lg py-2"
    :class="highlight && '-mx-2 bg-accent/10 px-2'"
    :data-new="newIds.has(post.id) ? post.id : undefined"
    :aria-label="`${post.kind === 'reply' ? 'Reply' : 'Annotation'} by ${post.authorName}`"
  >
    <UserAvatar :id="post.authorId" :name="post.authorName" />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2 text-sm">
        <span class="font-semibold">{{ post.authorName }}</span>
        <time
          v-tooltip.bottom="fullDateTime(post.createdAt)"
          :datetime="post.createdAt"
          class="text-muted"
        >
          {{ relativeTime(post.createdAt, now) }}
        </time>
        <span
          v-if="post.editedAt"
          v-tooltip.bottom="`Edited ${fullDateTime(post.editedAt)}`"
          class="text-muted"
        >
          · edited
        </span>
        <!-- Fades away once the post has been read (see useUnreadPosts). -->
        <Transition leave-active-class="transition-opacity duration-700" leave-to-class="opacity-0">
          <Tag v-if="newIds.has(post.id)" value="New" severity="info" class="px-1.5 py-0 text-xs" />
        </Transition>
      </div>

      <form v-if="editing" class="mt-1.5 grid gap-2" @submit.prevent="saveEdit">
        <Textarea
          ref="editBox"
          v-model="editDraft"
          auto-resize
          rows="3"
          maxlength="5000"
          aria-label="Edit your annotation"
          @keydown.meta.enter.prevent="saveEdit"
          @keydown.ctrl.enter.prevent="saveEdit"
          @keydown.esc="editing = false"
        />
        <Message v-if="error" severity="error" size="small" variant="simple">{{ error }}</Message>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" severity="secondary" text size="small" @click="editing = false" />
          <Button
            type="submit"
            label="Save"
            size="small"
            :loading="busy"
            :disabled="!editDraft.trim()"
          />
        </div>
      </form>
      <p v-else class="mt-0.5 leading-relaxed break-words whitespace-pre-wrap">{{ post.body }}</p>

      <div v-if="post.authorId === currentUserId && !editing" class="mt-1 -ml-2 flex gap-1">
        <Button
          label="Edit"
          icon="pi pi-pencil"
          severity="secondary"
          text
          size="small"
          @click="startEdit"
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          @click="confirmDelete"
        />
      </div>
    </div>
  </article>
</template>
