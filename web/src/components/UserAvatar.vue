<script setup lang="ts">
import Avatar from 'primevue/avatar'
import { computed } from 'vue'
import { initials } from '@/utils/format'

const props = defineProps<{ id: string; name: string; size?: 'normal' | 'large' }>()

// Fixed per person (hashed from their id), so someone is the same color everywhere. Every shade
// carries white text at 4.5:1 or better.
const COLORS = [
  '#4f46e5',
  '#0f766e',
  '#b45309',
  '#be123c',
  '#7c3aed',
  '#0369a1',
  '#15803d',
  '#a21caf',
]
const color = computed(() => {
  let hash = 0
  for (const char of props.id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
})
</script>

<template>
  <!-- Decorative: the name is always shown or announced next to it. -->
  <Avatar
    :label="initials(name)"
    shape="circle"
    :size="size === 'large' ? 'large' : undefined"
    class="shrink-0 font-semibold text-white"
    :style="{ backgroundColor: color }"
    aria-hidden="true"
  />
</template>
