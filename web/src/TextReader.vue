<script setup lang="ts">
import { computed, onUpdated, ref } from 'vue'

const props = defineProps<{
  text: string
  ranges: { id: string; start: number; end: number }[]
  pending: { start: number; end: number } | null
  activeId: string | null
}>()
const emit = defineEmits<{
  select: [id: string]
  selection: [range: { start: number; end: number } | null]
}>()

const root = ref<HTMLElement>()

/**
 * Split the text at every highlight boundary. Each segment knows which annotations cover it,
 * which is how overlapping highlights render without nesting spans.
 * INVARIANT: the reader's DOM contains nothing but these text slices, so a character's
 * position in the DOM text equals its offset in the source text — see offsetIn().
 */
const segments = computed(() => {
  const cuts = new Set([0, props.text.length])
  for (const r of props.ranges) { cuts.add(r.start); cuts.add(r.end) }
  if (props.pending) { cuts.add(props.pending.start); cuts.add(props.pending.end) }
  const pts = [...cuts].sort((a, b) => a - b)
  return pts.slice(0, -1).map((start, i) => {
    const end = pts[i + 1]
    return {
      start,
      text: props.text.slice(start, end),
      ids: props.ranges.filter(r => r.start <= start && r.end >= end).map(r => r.id),
      pending: !!props.pending && props.pending.start <= start && props.pending.end >= end,
    }
  })
})

function offsetIn(node: Node, offset: number) {
  const r = document.createRange()
  r.selectNodeContents(root.value!)
  r.setEnd(node, offset)
  return r.toString().length
}

// A drag-select ends with mouseup (we emit the selection) and then a `click`. Emitting the selection
// re-renders the segments, which destroys the native selection, so that trailing click would look like a
// plain click on empty text and clear what we just set. Remember the mouseup produced a selection.
let justSelected = false
const onMouseDown = () => { justSelected = false }

function onMouseUp() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root.value) return emit('selection', null)
  const range = sel.getRangeAt(0)
  if (!root.value.contains(range.startContainer) || !root.value.contains(range.endContainer)) return
  let start = offsetIn(range.startContainer, range.startOffset)
  let end = offsetIn(range.endContainer, range.endOffset)
  while (start < end && /\s/.test(props.text[start])) start++ // trim whitespace the drag grabbed
  while (end > start && /\s/.test(props.text[end - 1])) end--
  if (end > start) {
    justSelected = true
    emit('selection', { start, end })
  }
}

function onSegClick(ids: string[]) {
  if (justSelected) return
  if (!window.getSelection()?.isCollapsed) return // finishing a drag-select, not clicking
  if (!ids.length) return emit('selection', null)
  // Overlapping highlights: clicking again cycles through the threads under the cursor.
  const i = props.activeId ? ids.indexOf(props.activeId) : -1
  emit('select', ids[(i + 1) % ids.length])
}

onUpdated(() => {
  if (import.meta.env.DEV && root.value && root.value.textContent !== props.text)
    console.warn('[reader] DOM text drifted from source text; offsets will be wrong')
})

defineExpose({
  scrollTo(id: string) {
    root.value?.querySelector(`[data-ids~="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
})
</script>

<template>
  <div ref="root" class="reader" @mousedown="onMouseDown" @mouseup="onMouseUp"><span
      v-for="s in segments"
      :key="s.start"
      :data-ids="s.ids.join(' ')"
      :class="{ hl: s.ids.length, multi: s.ids.length > 1, active: activeId && s.ids.includes(activeId), pending: s.pending }"
      @click="onSegClick(s.ids)"
    >{{ s.text }}</span></div>
</template>
