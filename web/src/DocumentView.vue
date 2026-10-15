<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { createAnchor, resolveAnchor } from '../../shared/anchor'
import { client, unwrap, type Annotation } from './api'
import { currentUserId } from './session'
import { useAnnotations } from './useAnnotations'
import SidePanel from './SidePanel.vue'
import TextReader from './TextReader.vue'

const props = defineProps<{ documentId: string }>()

const doc = ref<{ id: string; title: string; author: string; text: string } | null>(null)
const loadError = ref('')
const { load, apply, roots, repliesOf, connected } = useAnnotations(props.documentId)

const selectedId = ref<string | null>(null)
const pending = ref<{ start: number; end: number } | null>(null)
const busy = ref(false)
const error = ref('')
const reader = ref<InstanceType<typeof TextReader>>()


onMounted(async () => {
  try {
    doc.value = await unwrap(await client.api.documents[':id'].$get({ param: { id: props.documentId } }))
    await load()
  } catch (e) {
    loadError.value = (e as Error).message
  }
})

// Resolve every anchor against the current text: offsets if intact, quote+context if it moved, else orphaned.
const resolved = computed(() => {
  const text = doc.value?.text ?? ''
  return roots.value.map(a => ({ a, r: a.anchor ? resolveAnchor(text, a.anchor) : null }))
})
const ranges = computed(() => resolved.value.filter(x => x.r).map(x => ({ id: x.a.id, start: x.r!.start, end: x.r!.end })))
const placed = computed(() => resolved.value.filter(x => x.r).map(x => x.a).sort((a, b) => ranges.value.find(r => r.id === a.id)!.start - ranges.value.find(r => r.id === b.id)!.start))
const orphaned = computed(() => resolved.value.filter(x => !x.r).map(x => x.a))
const selected = computed<Annotation | null>(() => roots.value.find(a => a.id === selectedId.value) ?? null)

function onSelection(range: { start: number; end: number } | null) {
  pending.value = range
  console.log("pending",pending.value)

  if (range) selectedId.value = null
}
function select(id: string) {
  selectedId.value = id
  pending.value = null
  error.value = ''
  void nextTick(() => reader.value?.scrollTo(id))
}
function closePanel() {
  selectedId.value = null
  pending.value = null
  error.value = ''
  window.getSelection()?.removeAllRanges()
}

async function run(fn: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}

const createRoot = (body: string) =>
  run(async () => {
    const p = pending.value!
    const anchor = createAnchor(doc.value!.text, p.start, p.end)
    const created = await unwrap(await client.api.documents[':id'].annotations.$post({ param: { id: props.documentId }, json: { anchor, body } }))
    apply(created) // the SSE echo will arrive too; apply-by-id makes that a no-op
    select(created.id)
  })

const reply = (rootId: string, body: string) =>
  run(async () => apply(await unwrap(await client.api.annotations[':id'].replies.$post({ param: { id: rootId }, json: { body } }))))

const upvote = (id: string) =>
  run(async () => apply(await unwrap(await client.api.annotations[':id'].upvote.$post({ param: { id } }))))
</script>

<template>
  <div class="page">
    <p v-if="loadError" class="err">{{ loadError }}</p>
    <template v-if="doc">
      <div class="row">
        <div class="spacer">
          <h2 style="margin: 0">{{ doc.title }}</h2>
          <small>{{ doc.author }}</small>
        </div>
        <span class="status" :class="{ on: connected }">{{ connected ? 'live' : 'reconnecting…' }}</span>
      </div>
      <div class="doc-layout" style="margin-top: 16px">
        <TextReader
          ref="reader"
          :text="doc.text"
          :ranges="ranges"
          :pending="pending"
          :active-id="selectedId"
          @select="select"
          @selection="onSelection"
        />
        <SidePanel
          :pending-quote="pending ? doc.text.slice(pending.start, pending.end) : null"
          :selected="selected"
          :replies="selected ? repliesOf(selected.id) : []"
          :placed="placed"
          :orphaned="orphaned"
          :reply-count="id => repliesOf(id).length"
          :me="currentUserId"
          :busy="busy"
          :error="error"
          @create-root="createRoot"
          @reply="reply"
          @upvote="upvote"
          @select="select"
          @close="closePanel"
        />
      </div>
    </template>
  </div>
</template>
