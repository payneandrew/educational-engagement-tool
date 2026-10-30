import { onScopeDispose, ref, type Ref } from 'vue'

/** The current time, refreshed every 30s, so "5 minutes ago" labels stay true. One timer for the app. */
const now = ref(Date.now())
let users = 0
let timer: ReturnType<typeof setInterval> | undefined

export function useNow(): Ref<number> {
  if (users++ === 0) timer = setInterval(() => (now.value = Date.now()), 30_000)
  onScopeDispose(() => {
    if (--users === 0) clearInterval(timer)
  })
  return now
}
