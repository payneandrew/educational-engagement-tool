import { computed, inject, onScopeDispose, provide, reactive, ref, type InjectionKey } from 'vue'
import type { AnnotationEvent } from '../../../server/src/realtime/events'
import { client, messageOf, unwrap, type Annotation } from '@/api/client'
import { currentUserId } from '@/api/session'
import { ensureConnected, socket } from '@/api/socket'

/**
 * One reading's discussion: the annotations, the live connection, and the actions that change them.
 * The reading page creates it with `provideAnnotations`; components below it get it with `useAnnotations`.
 *
 * Live updates come over the tab's shared Socket.IO connection. On mount (and on any reconnect the
 * server couldn't recover) we subscribe to the reading, then load the full list over REST and apply
 * live events on top. When the server *does* recover a short drop, it has already put us back in the
 * room and replayed what we missed, so there's nothing to reload. Events that arrive while a load is
 * in flight are held back and applied after it, so a slow response can't overwrite a newer edit or
 * bring back a deleted post.
 */
function createAnnotations(readingId: string) {
  const byId = reactive<Record<string, Annotation>>({})
  /** True only after an established connection drops, so the first connect doesn't flash a warning. */
  const connectionLost = ref(false)
  /** Who has this reading open right now, from the server's `reading:viewers` events. */
  const viewers = ref<{ id: string; name: string }[]>([])
  const loadError = ref('')
  /** True until the first load finishes. Reloads after a reconnect keep showing the current list. */
  const loading = ref(true)
  /** Posts that arrived live from someone else since the page opened; the feed marks them "New". */
  const newIds = reactive(new Set<string>())
  /** Read out by an aria-live region, so screen reader users hear about live arrivals too. */
  const announcement = ref('')
  let pending: AnnotationEvent[] | null = null // non-null while a load is in flight

  function applyEvent(event: AnnotationEvent) {
    if (event.type !== 'deleted') byId[event.annotation.id] = event.annotation
    // Deleting a top-level annotation also deleted its replies.
    else
      for (const annotation of Object.values(byId))
        if (annotation.id === event.id || annotation.parentId === event.id)
          delete byId[annotation.id]
  }
  /** A live post someone else just wrote (not the echo of this user's own write). */
  function noteArrival({ id, authorId, authorName, kind }: Annotation) {
    if (loading.value || byId[id] || authorId === currentUserId.value) return
    newIds.add(id)
    announcement.value = `New ${kind === 'reply' ? 'reply' : 'annotation'} from ${authorName}`
  }
  function receive(event: AnnotationEvent) {
    if (pending) pending.push(event)
    else applyEvent(event)
  }

  const subscription = { type: 'reading', readingId } as const

  /** Join the reading's room; the server acknowledges once we're in (or says why not). */
  async function subscribe() {
    const result = await socket.timeout(10_000).emitWithAck('subscribe', subscription)
    if (!result.ok) throw new Error(result.error)
  }

  /** Subscribe first, then fetch: anything written after the fetch starts arrives as a live event. */
  async function resync() {
    pending = []
    try {
      await subscribe()
      const list = await unwrap(
        await client.api.readings[':id'].annotations.$get({ param: { id: readingId } }),
      )
      for (const id of Object.keys(byId)) delete byId[id]
      for (const annotation of list) byId[annotation.id] = annotation
      loadError.value = ''
    } catch (error) {
      loadError.value = messageOf(error)
    } finally {
      loading.value = false
      const queued = pending
      pending = null
      queued.forEach(applyEvent)
    }
  }

  // The socket is shared across pages, so ignore events for other readings.
  const isHere = (payload: { readingId: string }) => payload.readingId === readingId
  const onCreated = (annotation: Annotation) => {
    if (!isHere(annotation)) return
    noteArrival(annotation)
    receive({ type: 'created', annotation })
  }
  const onUpdated = (annotation: Annotation) => {
    if (isHere(annotation)) receive({ type: 'updated', annotation })
  }
  const onDeleted = (deleted: { id: string; readingId: string }) => {
    if (isHere(deleted)) receive({ type: 'deleted', ...deleted })
  }
  const onViewers = (update: { readingId: string; viewers: { id: string; name: string }[] }) => {
    if (isHere(update)) viewers.value = update.viewers
  }
  const onConnect = () => {
    connectionLost.value = false
    // Recovered: the server restored our rooms and replayed missed events. Otherwise start over.
    if (!socket.recovered) void resync()
  }
  const onDisconnect = (reason: string) => {
    if (reason === 'io client disconnect') return // we closed it on purpose (switching user)
    connectionLost.value = true
    // Socket.IO retries on its own, except when the server ended the connection deliberately.
    if (reason === 'io server disconnect') socket.connect()
  }
  const onConnectError = (error: Error) => {
    if (socket.active)
      connectionLost.value = true // a network problem; it keeps retrying
    else {
      // The server refused the handshake (e.g. unknown user); retrying won't help.
      loadError.value = error.message
      loading.value = false
    }
  }

  socket.on('annotation:created', onCreated)
  socket.on('annotation:updated', onUpdated)
  socket.on('annotation:deleted', onDeleted)
  socket.on('reading:viewers', onViewers)
  socket.on('connect', onConnect)
  socket.on('disconnect', onDisconnect)
  socket.on('connect_error', onConnectError)
  // Already connected (another page opened the socket): subscribe now. Otherwise `connect` will.
  if (socket.connected) void resync()
  else ensureConnected()

  onScopeDispose(() => {
    socket.off('annotation:created', onCreated)
    socket.off('annotation:updated', onUpdated)
    socket.off('annotation:deleted', onDeleted)
    socket.off('reading:viewers', onViewers)
    socket.off('connect', onConnect)
    socket.off('disconnect', onDisconnect)
    socket.off('connect_error', onConnectError)
    if (socket.connected) socket.emit('unsubscribe', subscription)
  })

  const all = computed(() => Object.values(byId))
  // Replies read as a conversation, oldest first.
  const repliesOf = (rootId: string) =>
    all.value
      .filter((annotation) => annotation.parentId === rootId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  // Newest first.
  const roots = computed(() =>
    all.value
      .filter((annotation) => annotation.kind === 'root')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  )

  const total = computed(() => all.value.length)
  /** Everyone who has posted here, with how many annotations each, sorted by name. */
  const authors = computed(() => {
    const authorsById = new Map<string, { id: string; name: string; count: number }>()
    for (const annotation of all.value) {
      const { authorId, authorName } = annotation
      const author = authorsById.get(authorId) ?? { id: authorId, name: authorName, count: 0 }
      author.count++
      authorsById.set(authorId, author)
    }
    return [...authorsById.values()].sort((left, right) => left.name.localeCompare(right.name))
  })
  // Only students can post, so the authors are the students participating.
  const studentCount = computed(() => authors.value.length)

  /** True while one of this user's writes is in flight; the forms disable their buttons. */
  const busy = ref(false)

  /**
   * Runs one of this user's writes and applies the result right away, so the author sees it without
   * waiting for the live event (which arrives too and just sets the same values again). It goes through
   * `receive`, like a live event, so the same ordering rules hold. Resolves to an error message, or null.
   */
  async function write(request: () => Promise<AnnotationEvent>): Promise<string | null> {
    busy.value = true
    try {
      receive(await request())
      return null
    } catch (error) {
      return messageOf(error)
    } finally {
      busy.value = false
    }
  }

  const create = (body: string) =>
    write(async () => ({
      type: 'created',
      annotation: await unwrap(
        await client.api.readings[':id'].annotations.$post({
          param: { id: readingId },
          json: { body },
        }),
      ),
    }))
  const reply = (rootId: string, body: string) =>
    write(async () => ({
      type: 'created',
      annotation: await unwrap(
        await client.api.annotations[':id'].replies.$post({
          param: { id: rootId },
          json: { body },
        }),
      ),
    }))
  const edit = (id: string, body: string) =>
    write(async () => ({
      type: 'updated',
      annotation: await unwrap(
        await client.api.annotations[':id'].$patch({ param: { id }, json: { body } }),
      ),
    }))
  const remove = (id: string) =>
    write(async () => ({
      type: 'deleted',
      id: (await unwrap(await client.api.annotations[':id'].$delete({ param: { id } }))).id,
      readingId,
    }))

  return {
    roots,
    repliesOf,
    total,
    studentCount,
    authors,
    connectionLost,
    viewers,
    loading,
    loadError,
    newIds,
    announcement,
    busy,
    create,
    reply,
    edit,
    remove,
  }
}

const key: InjectionKey<ReturnType<typeof createAnnotations>> = Symbol('annotations')

/** Called once by the reading page: opens the live connection and shares it with the components below. */
export function provideAnnotations(readingId: string) {
  const annotations = createAnnotations(readingId)
  provide(key, annotations)
  return annotations
}

/** For components inside the reading page. */
export function useAnnotations() {
  const annotations = inject(key)
  if (!annotations) throw new Error('useAnnotations() needs provideAnnotations() in a parent')
  return annotations
}
