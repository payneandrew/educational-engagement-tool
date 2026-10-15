<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Annotation } from './api'

const props = defineProps<{
  pendingQuote: string | null
  selected: Annotation | null
  replies: Annotation[]
  placed: Annotation[]
  orphaned: Annotation[]
  replyCount: (id: string) => number
  me: string
  busy: boolean
  error: string
}>()
const emit = defineEmits<{
  createRoot: [body: string]
  reply: [rootId: string, body: string]
  upvote: [id: string]
  select: [id: string]
  close: []
}>()

const draft = ref('')
const replyDraft = ref('')
// Different context → fresh textbox.
watch(() => [props.pendingQuote, props.selected?.id], () => { draft.value = ''; replyDraft.value = '' })

const fmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const excerpt = (a: Annotation) => (a.anchor ? (a.anchor.exact.length > 70 ? a.anchor.exact.slice(0, 70) + '…' : a.anchor.exact) : '')
</script>

<template>
  <aside class="side">
    <!-- composing a new annotation -->
    <template v-if="pendingQuote">
      <h3>New annotation</h3>
      <div class="quote">{{ pendingQuote.length > 200 ? pendingQuote.slice(0, 200) + '…' : pendingQuote }}</div>
      <textarea v-model="draft" rows="4" placeholder="Add your comment…" autofocus />
      <div class="err">{{ error }}</div>
      <div class="row end">
        <button @click="emit('close')">Cancel</button>
        <button class="primary" :disabled="busy || !draft.trim()" @click="emit('createRoot', draft)">Post</button>
      </div>
    </template>

    <!-- a thread -->
    <template v-else-if="selected">
      <div class="row"><h3 class="spacer">Thread</h3><button @click="emit('close')">✕</button></div>
      <div v-if="selected.anchor" class="quote">{{ selected.anchor.exact }}</div>
      <template v-for="p in [selected, ...replies]" :key="p.id">
        <div class="post">
          <div class="meta">
            <strong>{{ p.authorName }}</strong><span>{{ fmt(p.createdAt) }}</span>
            <span class="spacer" />
            <button class="vote" :class="{ on: p.upvoterIds.includes(me) }" :disabled="p.authorId === me" @click="emit('upvote', p.id)">
              ▲ {{ p.upvoterIds.length }}
            </button>
          </div>
          <p>{{ p.body }}</p>
        </div>
      </template>
      <textarea v-model="replyDraft" rows="2" placeholder="Reply…" />
      <div class="err">{{ error }}</div>
      <div class="row end">
        <button class="primary" :disabled="busy || !replyDraft.trim()" @click="emit('reply', selected.id, replyDraft); replyDraft = ''">Reply</button>
      </div>
    </template>

    <!-- overview -->
    <template v-else>
      <h3>Annotations ({{ placed.length + orphaned.length }})</h3>
      <p v-if="!placed.length && !orphaned.length" class="status">Select any text to start a thread.</p>
      <button v-for="a in placed" :key="a.id" class="thread-item" @click="emit('select', a.id)">
        <small>“{{ excerpt(a) }}”</small>
        <strong>{{ a.authorName }}</strong>: {{ a.body.length > 60 ? a.body.slice(0, 60) + '…' : a.body }}
        <small>{{ replyCount(a.id) }} replies · ▲ {{ a.upvoterIds.length }}</small>
      </button>
      <template v-if="orphaned.length">
        <h3>Couldn't be placed in this version</h3>
        <button v-for="a in orphaned" :key="a.id" class="thread-item" @click="emit('select', a.id)">
          <small>“{{ excerpt(a) }}”</small>
          <strong>{{ a.authorName }}</strong>: {{ a.body.slice(0, 60) }}
        </button>
      </template>
    </template>
  </aside>
</template>
