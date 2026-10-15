import { ref, watch } from 'vue'

// sessionStorage (not localStorage) so two browser tabs can be two different users — handy for demoing real-time.
const KEY = 'marginalia:user'
const read = () => {
  try { return sessionStorage.getItem(KEY) ?? 'u-alice' } catch { return 'u-alice' }
}
export const currentUserId = ref(read())
watch(currentUserId, v => { try { sessionStorage.setItem(KEY, v) } catch { /* private mode */ } })
