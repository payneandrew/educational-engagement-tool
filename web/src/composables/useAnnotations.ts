import { computed, inject, onScopeDispose, provide, reactive, ref, type InjectionKey } from 'vue'
import type { AnnotationEvent, ReadingEvent } from '../../../server/src/realtime/events'
import { client, messageOf, unwrap, type Annotation } from '@/api/client'
import { currentUserId } from '@/api/session'

/**
 * One reading's discussion: the annotations, the live connection, and the actions that change them.
 * The reading page creates it with `provideAnnotations`; components below it get it with `useAnnotations`.
 *
 * Every time the SSE stream (re)connects we load the full list from the API, then apply live events
 * on top. Loading on reconnect covers anything missed while disconnected, so the server never needs
 * to replay history. Events that arrive while a load is in flight are held back and applied after it,
 * so a slow response can't overwrite a newer edit or bring back a deleted post.
 */
function createAnnotations(readingId: string) {
  const byId = reactive<Record<string, Annotation>>({})
  /** True only after an established stream drops, so the first connect doesn't flash a warning. */
  const connectionLost = ref(false)
  /** Who has this reading open right now, from the server's `viewers` events. */
  const viewers = ref<{ id: string; name: string }[]>([])
  const loadError = ref('')
  /** True until the first load finishes. Reloads after a reconnect keep showing the current list. */
  const loading = ref(true)
  let eventSource: EventSource | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let pending: AnnotationEvent[] | null = null // non-null while a load is in flight

  function applyEvent(event: AnnotationEvent) {
    if (event.type === 'annotation') byId[event.annotation.id] = event.annotation
    // Deleting a top-level annotation also deleted its replies.
    else
      for (const annotation of Object.values(byId))
        if (annotation.id === event.id || annotation.parentId === event.id)
          delete byId[annotation.id]
  }
  function receive(event: AnnotationEvent) {
    if (pending) pending.push(event)
    else applyEvent(event)
  }

  async function load() {
    pending = []
    try {
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

  function connect() {
    if (disposed) return
    // EventSource can't send headers, so the user id goes in the query string.
    const url = client.api.readings[':id'].stream.$url({ param: { id: readingId } })
    url.searchParams.set('uid', currentUserId.value)
    eventSource = new EventSource(url)
    eventSource.onopen = () => {
      connectionLost.value = false
      void load()
    }
    // Each message is one ReadingEvent, serialized by the server's stream route.
    eventSource.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ReadingEvent
      if (event.type === 'viewers') viewers.value = event.viewers
      else receive(event)
    }
    eventSource.onerror = () => {
      connectionLost.value = true
      // While CONNECTING the browser retries by itself. If it gave up (CLOSED, e.g. the server answered
      // with an error status), open a fresh stream ourselves.
      if (eventSource?.readyState === EventSource.CLOSED) retryTimer = setTimeout(connect, 3000)
    }
  }
  connect()

  onScopeDispose(() => {
    disposed = true
    eventSource?.close()
    clearTimeout(retryTimer)
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
   * waiting for the SSE event (which arrives too and just sets the same values again). It goes through
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
      type: 'annotation',
      annotation: await unwrap(
        await client.api.readings[':id'].annotations.$post({
          param: { id: readingId },
          json: { body },
        }),
      ),
    }))
  const reply = (rootId: string, body: string) =>
    write(async () => ({
      type: 'annotation',
      annotation: await unwrap(
        await client.api.annotations[':id'].replies.$post({
          param: { id: rootId },
          json: { body },
        }),
      ),
    }))
  const edit = (id: string, body: string) =>
    write(async () => ({
      type: 'annotation',
      annotation: await unwrap(
        await client.api.annotations[':id'].$patch({ param: { id }, json: { body } }),
      ),
    }))
  const remove = (id: string) =>
    write(async () => ({
      type: 'deleted',
      id: (await unwrap(await client.api.annotations[':id'].$delete({ param: { id } }))).id,
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
