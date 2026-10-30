import { computed, inject, onScopeDispose, provide, reactive, ref, type InjectionKey } from 'vue'
import {
  parseReadingEvent,
  type AnnotationEvent,
  type Viewer,
} from '../../../server/src/realtime/schema'
import { client, messageOf, parseResponse, type Annotation } from '@/api/client'
import { currentUserId } from '@/api/session'
import { ensureConnected, socket } from '@/api/socket'
import { newId, withRetry } from '@/api/retry'

/**
 * One reading's discussion: the annotations, the live connection, and the actions that change them.
 *
 * Live updates come over the tab's shared Socket.IO connection. On connect (or a reconnect the server
 * couldn't recover) we subscribe to the reading, load the full list, and apply live events on top.
 * When the server does recover a short drop, it has already restored our room and replayed what we
 * missed. Events that arrive during a load are held and applied after it, so a slow response can't
 * overwrite a newer edit or bring back a deleted post.
 */
function createAnnotations(readingId: string) {
  const byId = reactive<Record<string, Annotation>>({})
  /** Only true after an established connection drops. */
  const connectionLost = ref(false)
  const viewers = ref<Viewer[]>([])
  const loadError = ref('')
  const loading = ref(true)
  /** Posts from other people that arrived live; the feed tags them "New". */
  const newIds = reactive(new Set<string>())
  /** Read out by an aria-live region. */
  const announcement = ref('')
  let pending: AnnotationEvent[] | null = null // non-null while a load is in flight

  function applyEvent(event: AnnotationEvent) {
    if (event.type === 'annotation') byId[event.annotation.id] = event.annotation
    // Deleting a top-level annotation also deleted its replies.
    else
      for (const annotation of Object.values(byId))
        if (annotation.id === event.id || annotation.parentId === event.id)
          delete byId[annotation.id]
  }
  /** A live post by someone else (not an edit, not the echo of our own write). */
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
      const list = await parseResponse(
        client.api.readings[':id'].annotations.$get({ param: { id: readingId } }),
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
  const onReadingEvent = (eventReadingId: string, payload: unknown) => {
    if (eventReadingId !== readingId) return
    const event = parseReadingEvent(payload)
    if (!event) return console.warn('Ignored a live update it could not read:', payload)
    if (event.type === 'viewers') viewers.value = event.viewers
    else {
      if (event.type === 'annotation') noteArrival(event.annotation)
      receive(event)
    }
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

  socket.on('reading:event', onReadingEvent)
  socket.on('connect', onConnect)
  socket.on('disconnect', onDisconnect)
  socket.on('connect_error', onConnectError)
  // Already connected (another page opened the socket): subscribe now. Otherwise `connect` will.
  if (socket.connected) void resync()
  else ensureConnected()

  onScopeDispose(() => {
    socket.off('reading:event', onReadingEvent)
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
  /** Everyone who has posted, with their annotation counts, sorted by name. */
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

  const busy = ref(false)

  /**
   * Runs one of this user's writes and applies the result right away instead of waiting for the SSE
   * echo. Goes through `receive`, so the same ordering rules hold. Resolves to an error message or null.
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

  // The id is picked here so a retry after a lost response reuses it (the server dedupes on it).
  const post = (
    send: (json: { body: string; id: string }) => Promise<Annotation>,
    body: string,
  ) => {
    const id = newId()
    return write(async () => ({
      type: 'annotation',
      annotation: await withRetry(() => send({ body, id })),
    }))
  }
  const create = (body: string) =>
    post(
      (json) =>
        parseResponse(
          client.api.readings[':id'].annotations.$post({ param: { id: readingId }, json }),
        ),
      body,
    )
  const reply = (rootId: string, body: string) =>
    post(
      (json) =>
        parseResponse(client.api.annotations[':id'].replies.$post({ param: { id: rootId }, json })),
      body,
    )
  const edit = (id: string, body: string) =>
    write(async () => ({
      type: 'annotation',
      annotation: await parseResponse(
        client.api.annotations[':id'].$patch({ param: { id }, json: { body } }),
      ),
    }))
  const remove = (id: string) =>
    write(async () => ({
      type: 'deleted',
      id: (await parseResponse(client.api.annotations[':id'].$delete({ param: { id } }))).id,
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

export type Annotations = ReturnType<typeof createAnnotations>

const key: InjectionKey<Annotations> = Symbol('annotations')

/** Called once by the reading page: opens the connection and shares it with child components. */
export function provideAnnotations(readingId: string): Annotations {
  const annotations = createAnnotations(readingId)
  provide(key, annotations)
  return annotations
}

export function useAnnotations(): Annotations {
  const annotations = inject(key)
  if (!annotations) throw new Error('useAnnotations() needs provideAnnotations() in a parent')
  return annotations
}
