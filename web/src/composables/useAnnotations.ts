import { computed, inject, onScopeDispose, provide, reactive, ref, type InjectionKey } from 'vue'
import {
  parseReadingEvent,
  type AnnotationEvent,
  type Viewer,
} from '../../../server/src/realtime/schema'
import { client, messageOf, parseResponse, type Annotation } from '@/api/client'
import { currentUserId } from '@/api/session'
import { newId, withRetry } from '@/api/retry'

/**
 * One reading's discussion: the annotations, the live connection, and the actions that change them.
 *
 * Each time the SSE stream (re)connects we load the full list, then apply live events on top, so the
 * server never replays history. Events that arrive during a load are held and applied after it, so a
 * slow response can't overwrite a newer edit or bring back a deleted post.
 */
function createAnnotations(readingId: string) {
  const byId = reactive<Record<string, Annotation>>({})
  /** Only true after an established stream drops. */
  const connectionLost = ref(false)
  const viewers = ref<Viewer[]>([])
  const loadError = ref('')
  const loading = ref(true)
  /** Posts from other people that arrived live; the feed tags them "New". */
  const newIds = reactive(new Set<string>())
  /** Read out by an aria-live region. */
  const announcement = ref('')
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

  async function load() {
    pending = []
    try {
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
    eventSource.onmessage = (message: MessageEvent<string>) => {
      const event = parseReadingEvent(message.data)
      if (!event) return console.warn('Ignored a live update it could not read:', message.data)
      if (event.type === 'viewers') viewers.value = event.viewers
      else {
        if (event.type === 'annotation') noteArrival(event.annotation)
        receive(event)
      }
    }
    eventSource.onerror = () => {
      connectionLost.value = true
      // The browser retries by itself unless it gave up (CLOSED), then we open a fresh stream.
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
