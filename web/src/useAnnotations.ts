import { computed, onScopeDispose, reactive, ref } from 'vue'
import { client, unwrap, type Annotation } from './api'
import { currentUserId } from './session'

type Change = { type: 'annotation'; annotation: Annotation } | { type: 'deleted'; ids: string[] }

/**
 * Live view of one reading's discussion.
 *
 * Every time the SSE stream (re)connects we load the full list from the API, then apply live events
 * on top. Loading on reconnect covers anything missed while disconnected, so the server never needs
 * to replay history. Events that arrive while a load is in flight are held back and applied after it,
 * so a slow response can't overwrite a newer edit or bring back a deleted post.
 */
export function useAnnotations(documentId: string) {
  const byId = reactive<Record<string, Annotation>>({})
  /** True only after an established stream drops, so the first connect doesn't flash a warning. */
  const connectionLost = ref(false)
  const loadError = ref('')
  let es: EventSource | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let pending: Change[] | null = null // non-null while a load is in flight

  function applyChange(c: Change) {
    if (c.type === 'annotation') byId[c.annotation.id] = c.annotation
    else for (const id of c.ids) delete byId[id]
  }
  function receive(c: Change) {
    if (pending) pending.push(c)
    else applyChange(c)
  }

  async function load() {
    pending = []
    try {
      const list = await unwrap(await client.api.readings[':id'].annotations.$get({ param: { id: documentId } }))
      for (const k of Object.keys(byId)) delete byId[k]
      for (const a of list) byId[a.id] = a
      loadError.value = ''
    } catch (e) {
      loadError.value = (e as Error).message
    } finally {
      const queued = pending
      pending = null
      queued.forEach(applyChange)
    }
  }

  function connect() {
    if (disposed) return
    // EventSource can't send headers, so the user id goes in the query string.
    const url = client.api.readings[':id'].stream.$url({ param: { id: documentId } })
    url.searchParams.set('uid', currentUserId.value)
    es = new EventSource(url)
    es.onopen = () => {
      connectionLost.value = false
      void load()
    }
    es.addEventListener('annotation', e => receive({ type: 'annotation', annotation: JSON.parse((e as MessageEvent).data) }))
    es.addEventListener('deleted', e => receive({ type: 'deleted', ids: JSON.parse((e as MessageEvent).data) }))
    es.onerror = () => {
      connectionLost.value = true
      // While CONNECTING the browser retries by itself. If it gave up (CLOSED, e.g. the server answered
      // with an error status), open a fresh stream ourselves.
      if (es?.readyState === EventSource.CLOSED) retryTimer = setTimeout(connect, 3000)
    }
  }
  connect()

  onScopeDispose(() => {
    disposed = true
    es?.close()
    clearTimeout(retryTimer)
  })

  const all = computed(() => Object.values(byId))
  // Replies read as a conversation, oldest first.
  const repliesOf = (rootId: string) =>
    all.value.filter(a => a.parentId === rootId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  // Newest first.
  const roots = computed(() => all.value.filter(a => a.kind === 'root').sort((a, b) => b.createdAt.localeCompare(a.createdAt)))

  const total = computed(() => all.value.length)
  // Only students can post, so distinct authors = students participating.
  const studentCount = computed(() => new Set(all.value.map(a => a.authorId)).size)

  // `apply` is for the results of this user's own writes: same path as live events, so the same ordering rules hold.
  return { roots, repliesOf, total, studentCount, apply: receive, connectionLost, loadError }
}
