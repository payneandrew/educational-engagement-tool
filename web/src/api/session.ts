import { ref, watch } from 'vue'

// sessionStorage (not localStorage) so two browser tabs can be two different users — handy for demoing real-time.
const KEY = 'marginalia:user'
export const currentUserId = ref(sessionStorage.getItem(KEY) ?? 'u-alice')
watch(currentUserId, (id) => sessionStorage.setItem(KEY, id))
