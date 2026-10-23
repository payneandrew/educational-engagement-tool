# Marginalia — a collaborative reading app

Instructors assign readings; students discuss them through annotations (comments on a whole reading), with replies, live updates, and edit/delete of their own posts.

**Stack:** TypeScript · Vue 3 (`<script setup>`) + Vite · Hono on `@hono/node-server` · MongoDB (official driver) · Zod via `@hono/zod-validator`.

## Run it

```bash
npm install
npm run dev        # MongoDB + API (:3001) + web (:5173), seeded on first run
```

Open http://localhost:5173. Use the **Viewing as** dropdown to switch between seeded users (Alice, Bob, Carol are students; Dana is the instructor). `sessionStorage` holds the choice, so **two browser tabs can be two different users** — open Alice and Bob side by side to watch annotations appear live. Students can post, reply, and edit/delete their own annotations; the instructor reads every discussion.

`npm run dev` starts a persistent single-node MongoDB **replica set** (via `mongodb-memory-server`, data in `.data/`, port 27018). A replica set is required for change streams and transactions. To use your own cluster, set `MONGO_URI` (and run `dev:api` / `dev:web` only). `npm run seed` resets the data to the sample readings and annotations; `npm test` runs the tests; `npm run typecheck` checks server + web together.

## Architecture in one page

```
Vue (hc<AppType>) ──REST──▶ Hono ──txn: bump document seq + write──▶ MongoDB annotations
        ▲                                                              │ change stream
        └────────SSE (one per open reading, Last-Event-ID replay)◀── Hub (in-process routing)
```

### Hono RPC
`server/src/app.ts` defines every route as **one chained expression** and exports `AppType`. `web/src/api.ts` does `hc<AppType>(location.origin)`; the `Annotation` response type is derived with `InferResponseType`. No codegen, no API types written by hand on the client. `validate()` (in `schemas.ts`) wraps `zValidator` with a failure hook so 400s are a clean `{ error }` rather than leaking zod's raw result type into every response union.

### Roles
No real auth: the client sends the selected user id (`x-user-id`) and the server looks the user up. Reads (readings, annotations, the live stream) are open to any user; writes are student-only (403 for instructors). Edit/delete are author-only (403 otherwise).

### Real-time (SSE)
- Writes happen in a **transaction that first increments a per-document counter** (`channel_counters`) and stamps the result onto the annotation as `seq`. The counter doc is a write-conflict point, so writers on a document serialize and **commit order = seq order**; an aborted write rolls back its increment, so seqs are **gapless**.
- **One change stream** on `annotations` (with pre/post-images so each event carries the document *as of that write*) feeds an in-process `Hub` that routes to subscribers by `documentId`. No Redis, no broker. The write path never calls "broadcast": whatever is in Mongo is what gets fanned out.
- Each SSE event has `id: <seq>`. On reconnect the browser sends `Last-Event-ID`; the server replays `seq > N` from MongoDB. (First connect passes `?lastEventId=` from the REST snapshot, since `EventSource` can't set headers.)
- **Self-healing:** each subscriber keeps a high-water mark. A live event must be exactly `hw+1`; anything further ahead means something was dropped, so the subscriber re-reads the gap from MongoDB. A change-stream failure triggers a reconnect and the same catch-up for every subscriber (tested by killing the stream mid-run and writing while it's down). Replay is **state-based** (current version of each changed post, not an event log) and clients apply by id keeping the highest `seq`, so replay, live delivery and the client's own POST response can interleave safely.
- **Backpressure:** per-client write queue is bounded; a stalled client is cut off and replays on reconnect (see below).
- Heartbeat comment (`: heartbeat`) every 20 s (`HEARTBEAT_MS` to override). An unknown/future `Last-Event-ID` yields a `resync` event.

## MongoDB document shapes

| Collection | Shape | Notes |
|---|---|---|
| `users` | `{ _id, name, role }` | `role` is `'student' \| 'instructor'`. |
| `documents` | `{ _id, title, author, text, wordCount }` | The readings. |
| `annotations` | `{ _id, documentId, seq, kind: 'root'\|'reply', parentId, authorId, authorName, body, createdAt, editedAt, deletedAt }` | See below. |
| `channel_counters` | `{ _id: documentId, seq }` | The sequence source. |

Modeling choices:
- **Roots and replies in one collection.** One change stream, one per-document sequence, one replay query cover a whole conversation. `parentId` links replies (one level deep).
- **`authorName` denormalized.** Display-only, avoids a join per render. Cost: a rename doesn't propagate; fine for this domain.
- **`seq` re-stamped on every mutation**, which is what makes replay a single indexed range query (`{documentId, seq}`, unique).
- **Soft delete (tombstones).** Replay is "current state of everything changed after seq N", and a vanished row isn't a changed row, so a hard delete would be invisible to any client that was offline at the time. Delete is instead a normal write: new `seq`, `deletedAt` set, body wiped. It broadcasts and replays like everything else. Edits work the same way (`body`, `editedAt`, new `seq`). Deleted posts can't be edited or replied to. Deleting a root keeps its replies (shown under a "[deleted]" parent). Cost: tombstone rows live forever unless compacted.
- **Empty annotations** are rejected on the server (`body` is trimmed, then must be non-empty) and the Post button is disabled client-side.

## Design decisions and tradeoffs

### SSE vs WebSockets
Traffic here is overwhelmingly server→client; writes are ordinary POSTs that already need validation and auth. SSE gives that with plain HTTP (works with proxies, cookies, HTTP/2 multiplexing, simple load-balancing) and **resume is built in**: the browser reconnects and sends `Last-Event-ID` for free. WebSockets would need a hand-rolled reconnect/resume protocol and a second write path. Costs of SSE: no client→server channel (fine), text-only, and the browser's 6-connections-per-origin limit on HTTP/1.1 (one stream per open document; HTTP/2 removes it). Choose WebSockets if you add presence/typing indicators or other high-rate bidirectional traffic.

### Where this falls over at 10,000 concurrent users
1. **Single process holds all connections and the one change stream.** 10k idle SSE sockets is feasible on one Node process, but not highly available, and a deploy drops everyone (they reconnect together — a thundering herd of replay queries). Scale-out means N API nodes, each running its own change stream (every node sees every write) and routing to its local subscribers. That multiplies change-stream load on MongoDB by N; the fix is a dedicated fan-out tier or partitioning channels across nodes.
2. **Channel counter hot spot.** Every write on a document takes a transaction on one counter doc, serializing that document's writers. Fine for a class of 30; a 10k-person live lecture on one reading would conflict and retry constantly. Fix: shard channels smaller (e.g. per section), or drop transactions for an ordering scheme from the oplog (e.g. use the change stream's cluster time).
3. **Reconnect storms.** Replay hits Mongo (`{documentId, seq}` index — cheap, but 10k at once is not). Add jitter to `retry`, and cap replay size by falling back to a fresh snapshot.
4. **Slow consumers (handled, with limits).** Each client's writes go through a bounded queue (`realtime/bounded-sender.ts`, `SSE_MAX_PENDING`, default 500). A client that stops reading is disconnected instead of growing memory; it reconnects and replays from MongoDB. What's still missing: the bound counts *writes*, not bytes, so large events fill memory faster than small ones; there's no global cap on total connections or total queued bytes; and a mass-stall (e.g. a proxy hiccup) turns into a reconnect storm, which is item 3.
5. **Dev `mongodb-memory-server`** is a dev convenience only; production needs a real replica set. Change-stream post-images also need MongoDB ≥ 6.0 and add oplog/storage overhead.
6. No auth or rate limiting.

## Project layout

```
server/src/   Hono app (app.ts), services/, realtime/hub.ts, seed
web/src/      Vue app: reading list, reading page + discussion feed, typed hc client
seed-data/    public-domain texts (Project Gutenberg)
scripts/      dev MongoDB launcher, one-off seed text prep
```

## Tests
`npm test`: integration tests against a real throwaway MongoDB replica set covering gapless seqs under concurrent writers, per-document fan-out, `Last-Event-ID` replay, healing from a dropped broadcast, empty-annotation validation, edit/delete (live broadcast, author-only, tombstone replay to an offline client, deleted posts inert, replies survive a deleted root), and recovery after the change stream is killed with writes landing during the outage. A real-TCP test opens a stream that never reads and asserts the server drops it while a healthy client on the same document keeps receiving every event, and that the dropped client can replay everything from MongoDB.
