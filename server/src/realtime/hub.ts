import type { ChangeStream, ResumeToken } from 'mongodb'
import { annotations } from '../db'
import type { AnnotationDoc } from '../models'
import { changedAfter, currentSeq, toDTO } from '../services/annotations'

export interface SseMessage {
  id?: number
  event: 'annotation' | 'resync'
  data: string
}

/**
 * One connected viewer of one document's annotation channel.
 *
 * Invariant: everything with seq <= `hw` has already been sent. Live events are applied only
 * if they are exactly hw+1; anything further ahead means we missed something (dropped
 * broadcast, change-stream restart) and we heal by re-reading from MongoDB, the source of truth.
 */
export class Subscriber {
  private buffer: AnnotationDoc[] = []
  private replaying = false
  closed = false

  constructor(
    readonly documentId: string,
    public hw: number,
    private readonly emit: (m: SseMessage) => void,
  ) {}

  private send(doc: AnnotationDoc) {
    this.emit({ id: doc.seq, event: 'annotation', data: JSON.stringify(toDTO(doc)) })
    this.hw = Math.max(this.hw, doc.seq)
  }

  /** Entry point for live change-stream events. */
  deliver(doc: AnnotationDoc) {
    if (this.closed) return
    if (this.replaying) return void this.buffer.push(doc) // order is restored when the replay drains
    if (doc.seq <= this.hw) return // duplicate or already covered by a replay
    if (doc.seq === this.hw + 1) return this.send(doc)
    void this.catchUp() // gap
  }

  /** Replay from MongoDB everything after our high-water mark, then drain what arrived meanwhile. */
  async catchUp() {
    if (this.replaying || this.closed) return
    this.replaying = true
    try {
      const latest = await currentSeq(this.documentId)
      if (this.hw > latest) {
        // Client claims to have seen the future (DB was reset). Tell it to start over.
        this.emit({ event: 'resync', data: JSON.stringify({ seq: latest }) })
        this.hw = latest
      } else {
        for (const doc of await changedAfter(this.documentId, this.hw)) {
          if (this.closed) return
          this.send(doc)
        }
      }
    } catch (err) {
      console.error('[hub] replay failed; will retry on next event/heartbeat', err)
    } finally {
      this.replaying = false
    }
    const pending = this.buffer.splice(0)
    for (const doc of pending) this.deliver(doc)
  }
}

export class Hub {
  private channels = new Map<string, Set<Subscriber>>()
  private stream?: ChangeStream<AnnotationDoc>
  private resumeToken?: ResumeToken
  private stopped = false
  private ready!: () => void
  /** Resolves once the first change stream is established (tests and boot wait on this). */
  readonly started = new Promise<void>(r => (this.ready = r))

  start() {
    void this.run()
  }

  async stop() {
    this.stopped = true
    await this.stream?.close()
  }

  get subscriberCount() {
    let n = 0
    for (const s of this.channels.values()) n += s.size
    return n
  }

  /** Channels are keyed by documentId; change events are routed by the annotation's own documentId. */
  async subscribe(documentId: string, lastEventId: number | undefined, emit: (m: SseMessage) => void) {
    const start = lastEventId ?? (await currentSeq(documentId))
    const sub = new Subscriber(documentId, start, emit)
    const key = documentId
    if (!this.channels.has(key)) this.channels.set(key, new Set())
    this.channels.get(key)!.add(sub)
    // Register BEFORE replaying: live events that land during the replay are buffered, not lost.
    await sub.catchUp()
    return {
      sub,
      close: () => {
        sub.closed = true
        const set = this.channels.get(key)
        set?.delete(sub)
        if (set?.size === 0) this.channels.delete(key)
      },
    }
  }

  private route(doc: AnnotationDoc) {
    for (const sub of this.channels.get(doc.documentId) ?? []) sub.deliver(doc)
  }

  private async run() {
    let firstConnect = true
    while (!this.stopped) {
      try {
        this.stream = annotations.watch(
          [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }],
          // 'required' = the post-image at the moment of THIS write (needs changeStreamPreAndPostImages).
          { fullDocument: 'required', ...(this.resumeToken ? { resumeAfter: this.resumeToken } : {}) },
        )
        // Force the aggregate to actually reach the server so we know the stream is open.
        const first = await this.stream.tryNext()
        if (first && 'fullDocument' in first && first.fullDocument) this.route(first.fullDocument)
        this.resumeToken = this.stream.resumeToken
        if (!firstConnect) await this.catchUpAll() // anything lost while we were away
        firstConnect = false
        this.ready()
        for (;;) {
          const change = await this.stream.next()
          this.resumeToken = change._id
          if ('fullDocument' in change && change.fullDocument) this.route(change.fullDocument)
        }
      } catch (err) {
        if (this.stopped) return
        console.error('[hub] change stream error, reconnecting in 1s', err)
        this.resumeToken = undefined // resume tokens can fall off the oplog; replay-from-DB covers the gap
        firstConnect = false
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }

  private async catchUpAll() {
    await Promise.all([...this.channels.values()].flatMap(set => [...set].map(s => s.catchUp())))
  }
}

export const hub = new Hub()
