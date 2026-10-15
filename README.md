# Marginalia — a small social-annotation app

A stripped-down Perusall-style reader: highlight text, comment, reply, upvote, see classmates' activity live, and view an engagement score as an instructor.

**Stack:** TypeScript · Vue 3 (`<script setup>`) + Vite · Hono on `@hono/node-server` · MongoDB (official driver) · Zod via `@hono/zod-validator`.

## Run it

```bash
npm install
npm run dev        # MongoDB + API (:3001) + web (:5173), seeded on first run
```

Open http://localhost:5173. Use the **Viewing as** dropdown to switch between seeded users. `sessionStorage` holds the choice, so **two browser tabs can be two different users** — open Alice and Bob side by side (same group) to watch live updates, and Carol (other group) to see isolation. Dana is the instructor.

`npm run dev` starts a persistent single-node MongoDB **replica set** (via `mongodb-memory-server`, data in `.data/`, port 27018). A replica set is required for change streams and transactions. To use your own cluster, set `MONGO_URI` (and run `dev:api` / `dev:web` only). `npm run seed` resets the data; `npm test` runs the tests; `npm run typecheck` checks server + web together. `npm run test:e2e` runs the Playwright browser test (needs `npx playwright install chromium` once; it reseeds the dev database).

## Architecture in one page

```
Vue (hc<AppType>) ──REST──▶ Hono ──txn: bump channel seq + write──▶ MongoDB annotations
        ▲                                                              │ change stream
        └────────SSE (one per doc × group, Last-Event-ID replay)◀── Hub (in-process routing)
```

### Hono RPC
`server/src/app.ts` defines every route as **one chained expression** and exports `AppType`. `web/src/api.ts` does `hc<AppType>(location.origin)`; response types (`Annotation`, `ScoreRow`) are derived with `InferResponseType`. No codegen, no API types written by hand on the client. `validate()` (in `schemas.ts`) wraps `zValidator` with a failure hook so 400s are a clean `{ error }` rather than leaking zod's raw result type into every response union.

### Group scoping
Enforced on the server in two places, never on the client:
- **Queries:** the group always comes from the server-side user record, never a request parameter. Cross-group reads/writes return the same 404 as "doesn't exist".
- **Channel topology:** a channel is `documentId:groupId`. Subscribers register only under their own group, and change events are routed by the document's own `groupId`. Group B events are never touched while fanning out to Group A.

### Real-time (SSE)
- Writes happen in a **transaction that first increments a per-channel counter** (`channel_counters`) and stamps the result onto the annotation as `seq`. The counter doc is a write-conflict point, so writers on a channel serialize and **commit order = seq order**; an aborted write rolls back its increment, so seqs are **gapless**.
- **One change stream** on `annotations` (with pre/post-images so each event carries the document *as of that write*) feeds an in-process `Hub` that routes to subscribers by channel. No Redis, no broker. The write path never calls "broadcast": whatever is in Mongo is what gets fanned out.
- Each SSE event has `id: <seq>`. On reconnect the browser sends `Last-Event-ID`; the server replays `seq > N` from MongoDB. (First connect passes `?lastEventId=` from the REST snapshot, since `EventSource` can't set headers.)
- **Self-healing:** each subscriber keeps a high-water mark. A live event must be exactly `hw+1`; anything further ahead means something was dropped, so the subscriber re-reads the gap from MongoDB. A change-stream failure triggers a reconnect and the same catch-up for every subscriber (tested by killing the stream mid-run and writing while it's down). Replay is **state-based** (current version of each changed post, not an event log) and clients apply by id keeping the highest `seq`, so replay, live delivery and the client's own POST response can interleave safely.
- **Backpressure:** per-client write queue is bounded; a stalled client is cut off and replays on reconnect (see below).
- Heartbeat comment (`: heartbeat`) every 20 s (`HEARTBEAT_MS` to override). An unknown/future `Last-Event-ID` yields a `resync` event.

### Scoring
Not stored. `GET /api/instructor/documents/:id/scores` projects the document's posts, and a pure function (`scoring.ts`) turns them into scores using the config in the `settings` collection. Edit the config on the instructor page and **all history re-scores immediately**; there is nothing to backfill. Config knobs: points per comment/reply/upvote received/upvote given, minimum length to count, and a per-post cap on counted upvotes.

## MongoDB document shapes

| Collection | Shape | Notes |
|---|---|---|
| `groups` | `{ _id, name }` | |
| `users` | `{ _id, name, role, groupId \| null }` | Instructors have no group. |
| `documents` | `{ _id, title, author, text, version, wordCount }` | Plain text; `version` bumps if text changes. |
| `annotations` | `{ _id, documentId, groupId, seq, kind: 'root'\|'reply', parentId, authorId, authorName, body, anchor, docVersion, upvoterIds[], createdAt, editedAt, deletedAt }` | See below. |
| `channel_counters` | `{ _id: "docId:groupId", seq }` | The sequence source. |
| `settings` | `{ _id: 'scoring', value, updatedAt }` | |

`anchor` (roots only) = `{ start, end, exact, prefix, suffix }`.

Modeling choices:
- **Roots and replies in one collection.** One change stream, one per-channel sequence, one replay query cover a whole conversation. `parentId` links replies (one level deep).
- **`groupId` denormalized onto every annotation** (replies copy their parent's). It is the channel key, so routing, replay and listing never join to `users`; it is also what the unique index `{documentId, groupId, seq}` is built on.
- **`authorName` denormalized.** Display-only, avoids a join per thread render. Cost: a rename doesn't propagate; fine for this domain.
- **`upvoterIds` embedded** instead of a votes collection: voters per post are small and bounded, always read with the post, and an upvote is just another mutation of the post (new `seq`), so it replicates and replays through the same machinery for free. Cost: the 16 MB doc limit (irrelevant at classroom scale) and no cheap "all votes by user" query — scoring scans posts instead.
- **`seq` re-stamped on every mutation**, which is what makes replay a single indexed range query.
- **Soft delete (tombstones).** Replay is "current state of everything changed after seq N", and a vanished row isn't a changed row, so a hard delete would be invisible to any client that was offline at the time. Delete is instead a normal write: new `seq`, `deletedAt` set, body and votes wiped. It broadcasts and replays like everything else. Edits work the same way (`body`, `editedAt`, new `seq`). Only the author can edit/delete; deleted posts can't be edited, voted on, or replied to, and earn no score. Deleting a root keeps its replies (shown under a "[deleted]" parent). Cost: tombstone rows live forever unless compacted (see below).
- **Scores are not stored** (see above).

## Design decisions and tradeoffs

### Anchoring
Stored as character offsets plus the quoted text and 32 chars of prefix/suffix (the W3C TextPosition + TextQuoteSelector pairing). Rendering tries offsets first (exact match → done). If the text at those offsets differs, it searches for the quote and picks the occurrence whose surrounding context matches best; if the quote is ambiguous and the context doesn't clearly single one out, it **orphans** the annotation (listed in the panel, not shown inline) rather than attach it to the wrong sentence. The server also rejects anchors whose `exact` doesn't match the document text. Tests in `shared/anchor.test.ts`.

Where it breaks down:
- **Edited source:** if the quoted text itself changes (even one word), exact search fails and the annotation orphans. No fuzzy matching. Heavily repetitive text (lists, boilerplate) re-anchors poorly.
- **Reflow:** offsets are into the *source string*, which works here only because the reader renders the raw text with `white-space: pre-wrap` and no other text nodes. Render markdown/HTML, hyphenate, or change typography that alters the text content and DOM position ≠ source offset.
- **Pagination / PDFs:** offsets are per-string, but page-based renderers expose text per page and per text-layer item, with different extraction across engines. A selection spanning pages has no single offset.
- Offsets are UTF-16 code units; a different normalization (NFC/NFD, `\r\n`) shifts them.

A production version would: anchor to a **structural position** (block/paragraph id + offset within it) so edits elsewhere don't matter, keep immutable **document versions** and map annotations forward with a diff (e.g. diff-match-patch fuzzy search for the quote near the expected location) instead of searching from scratch, store the version each annotation was made against (`docVersion` is already recorded), and for PDFs anchor on page + normalized text-layer coordinates.

### SSE vs WebSockets
Traffic here is overwhelmingly server→client; writes are ordinary POSTs that already need validation and auth. SSE gives that with plain HTTP (works with proxies, cookies, HTTP/2 multiplexing, simple load-balancing) and **resume is built in**: the browser reconnects and sends `Last-Event-ID` for free. WebSockets would need a hand-rolled reconnect/resume protocol and a second write path. Costs of SSE: no client→server channel (fine), text-only, and the browser's 6-connections-per-origin limit on HTTP/1.1 (one stream per open document; HTTP/2 removes it). Choose WebSockets if you add presence/typing indicators or other high-rate bidirectional traffic.

### Where this falls over at 10,000 concurrent users
1. **Single process holds all connections and the one change stream.** 10k idle SSE sockets is feasible on one Node process, but not highly available, and a deploy drops everyone (they reconnect together — a thundering herd of replay queries). Scale-out means N API nodes, each running its own change stream (every node sees every write) and routing to its local subscribers. That multiplies change-stream load on MongoDB by N; the fix is a dedicated fan-out tier or partitioning channels across nodes.
2. **Channel counter hot spot.** Every write on a document×group takes a transaction on one counter doc, serializing that channel. Fine for a class of 30; a 10k-person live lecture in one channel would conflict and retry constantly. Fix: shard channels smaller (groups already do this), or drop transactions for an ordering scheme from the oplog (e.g. use the change stream's cluster time).
3. **Reconnect storms.** Replay hits Mongo (`{documentId, groupId, seq}` index — cheap, but 10k at once is not). Add jitter to `retry`, and cap replay size by falling back to a fresh snapshot.
4. **Slow consumers (handled, with limits).** Each client's writes go through a bounded queue (`realtime/bounded-sender.ts`, `SSE_MAX_PENDING`, default 500). A client that stops reading is disconnected instead of growing memory; it reconnects and replays from MongoDB. What's still missing: the bound counts *writes*, not bytes, so large events fill memory faster than small ones; there's no global cap on total connections or total queued bytes; and a mass-stall (e.g. a proxy hiccup) turns into a reconnect storm, which is item 3.
5. **Scoring on read.** Scans all posts of a document per instructor request. Fine at hundreds of posts; at scale, keep incremental per-user rollups updated from the change stream (the raw posts remain the source of truth, so a config change triggers a rebuild).
6. **Dev `mongodb-memory-server`** is a dev convenience only; production needs a real replica set. Change-stream post-images also need MongoDB ≥ 6.0 and add oplog/storage overhead.
7. No auth, rate limiting, or deletion/edit support (deletes would need tombstones so replay can express them).

## Project layout

```
server/src/   Hono app (app.ts), services/, realtime/hub.ts, scoring, seed
web/src/      Vue app: reader, side panel, instructor view, typed hc client
shared/       anchor logic used by both server and client
seed-data/    public-domain texts (Project Gutenberg)
scripts/      dev MongoDB launcher, one-off seed text prep
e2e/          Playwright two-user test
```

## Tests
`npm test`: anchoring (re-anchoring, ambiguity, orphaning), scoring (re-scoring on config change, caps), and integration tests against a real throwaway MongoDB replica set covering gapless seqs under concurrent writers, group-isolated fan-out, `Last-Event-ID` replay, upvote replay, healing from a dropped broadcast, edit/delete (live broadcast, author-only, tombstone replay to an offline client, deleted posts inert, no score for deleted posts), and recovery after the change stream is killed with writes landing during the outage. A real-TCP test opens a stream that never reads and asserts the server drops it while a healthy client on the same channel keeps receiving every event, and that the dropped client can replay everything from MongoDB.
