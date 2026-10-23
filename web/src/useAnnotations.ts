import { computed, onScopeDispose, reactive, ref } from 'vue'
import { client, unwrap, type Annotation } from './api'
import { currentUserId } from './session'

/**
 * Client view of one document's annotation channel: REST snapshot → SSE stream → idempotent apply.
 */
export function useAnnotations(documentId: string) {
  const byId = reactive<Record<string, Annotation>>({})
  /** True only after an established stream drops, so the first connect doesn't flash a warning. */
  const connectionLost = ref(false)
  let lastSeq = 0
  let es: EventSource | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  // Apply-by-id, keep the newest. Makes snapshot/live/replay/own-POST-response all safe to interleave.
  function apply(a: Annotation) {
    const cur = byId[a.id]
    if (!cur || a.seq >= cur.seq) byId[a.id] = a
    lastSeq = Math.max(lastSeq, a.seq)
  }

  async function load() {
    es?.close()
    const snap = await unwrap(await client.api.readings[':id'].annotations.$get({ param: { id: documentId } }))
    for (const k of Object.keys(byId)) delete byId[k]
    snap.annotations.forEach(apply)
    lastSeq = snap.seq // counter was read before the list, so everything after this seq replays
    connect()
  }

  function connect() {
    if (disposed) return
    // The hc client builds the URL (typed path + query); EventSource can't send headers, hence ?uid=.
    const url = client.api.readings[':id'].stream.$url({ param: { id: documentId }, query: { lastEventId: String(lastSeq) } })
    url.searchParams.set('uid', currentUserId.value)
    es = new EventSource(url)
    es.onopen = () => (connectionLost.value = false)
    es.addEventListener('annotation', e => apply(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('resync', () => void load()) // server says our position is invalid
    es.onerror = () => {
      connectionLost.value = true
      // While CONNECTING the browser retries by itself and sends Last-Event-ID. If it gave up (CLOSED), start over.
      if (es?.readyState === EventSource.CLOSED) retryTimer = setTimeout(() => void load().catch(() => {}), 3000)
    }
  }

  onScopeDispose(() => {
    disposed = true
    es?.close()
    clearTimeout(retryTimer)
  })

  const all = computed(() => Object.values(byId))
  // Replies read as a conversation, oldest first. Deleted replies are tombstones kept for sync; they are simply not shown.
  const repliesOf = (rootId: string) =>
    all.value.filter(a => a.parentId === rootId && !a.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  // Newest first. A deleted root stays only while it has replies (a "[deleted]" parent for them).
  const roots = computed(() =>
    all.value
      .filter(a => a.kind === 'root' && (!a.deletedAt || repliesOf(a.id).length))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )

  return { load, apply, roots, repliesOf, connectionLost }
}
