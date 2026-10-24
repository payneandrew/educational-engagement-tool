# Marginalia — a collaborative reading app

Instructors assign readings; students discuss them through annotations (comments on a whole reading), with replies, live updates, and edit/delete of their own posts.

**Stack:** TypeScript · Vue 3 (`<script setup>`) + Vite · Hono on `@hono/node-server` · MongoDB (official driver) · Zod via `@hono/zod-validator` · Tailwind CSS v4 · Vitest.

## Run it

Requires Node 20+. Nothing else to install: MongoDB is downloaded and run for you.

```bash
npm install
npm run dev        # MongoDB (:27018) + API (:3001) + web (:5173); sample data is loaded on first run
```

Open http://localhost:5173 and use **Viewing as** to pick a user:

- **Prof. Dana Reyes** (instructor): create readings with **New reading**, see each reading's annotation count and number of participating students, and read every discussion.
- **Alice, Bob, Carol** (students): browse readings (each shows its annotation count), post annotations, reply, and edit/delete your own.

The choice is per tab (`sessionStorage`), so open Alice and Bob in two tabs to watch annotations appear live.

Other commands: `npm run seed` resets the database to the sample data (in `server/src/seed.ts`), `npm test` runs the tests, `npm run typecheck` checks server and web together. `npm run lint` runs ESLint (config follows the `create-vue` defaults for Vue + TypeScript + Vitest, plus typescript-eslint's rules against unhandled promises) and `npm run format` applies Prettier; `lint:fix` and `format:check` also exist. To use your own MongoDB, set `MONGO_URI` and run `npm run dev:api` and `npm run dev:web` instead of `npm run dev`.

## How it works

```
Vue ──REST (typed hc client)──▶ Hono ──▶ MongoDB
 ▲                                │
 └──── SSE, one per open reading ◀┘ in-process event bus (events.ts)
```

- **Typed API with no codegen.** `server/src/app.ts` defines every route as one chained Hono expression and exports its type; `web/src/api.ts` builds a client from it with `hc<AppType>`, so request and response types are checked end to end. Request bodies are validated with Zod (`schemas.ts`), and failures come back as `{ error }` with a readable message.
- **Roles.** No real auth: the client sends the chosen user id (`x-user-id`) and the server looks the user up. Anyone can read. Creating a reading is instructor-only, posting is student-only, and editing or deleting is author-only (403 otherwise).
- **Live updates.** After each successful write, the annotation service publishes an event (`annotation` or `deleted`) on an in-process `EventEmitter`, keyed by reading. Each open SSE stream subscribes to its reading and forwards those events.
- **Counts.** `GET /api/readings` runs one aggregation over `annotations`, grouped by reading, that counts annotations (replies included) and collects distinct authors. Only students can post, so distinct authors = students participating. Nothing is stored, so counts can't drift out of date. On a reading's page the instructor's counts are computed from the live feed instead, so they update as students post.
- **Reconnects.** Whenever the stream (re)connects, the client reloads the reading's annotations over REST, so anything missed while disconnected is picked up without the server replaying history. Events that arrive during that reload are held and applied after it, so a slow response can't undo a newer change. A banner shows while the connection is down.

## Data model

| Collection    | Shape                                                                                                    | Notes                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users`       | `{ _id, name, role }`                                                                                    | `role` is `'student' \| 'instructor'`; seeded.                                                                |
| `readings`    | `{ _id, title, description, createdBy, createdByName, createdAt }`                                       | `createdBy` is the instructor's user id; `createdByName` is copied on like `authorName`. Listed newest first. |
| `annotations` | `{ _id, readingId, kind: 'root' \| 'reply', parentId, authorId, authorName, body, createdAt, editedAt }` | Indexed on `{readingId, createdAt}` and `parentId`.                                                           |

- **Roots and replies share one collection.** One query loads a whole discussion; `parentId` links a reply to its root (one level deep).
- **`authorName` is copied onto each annotation** so rendering a discussion needs no join to `users`. The cost is that a rename wouldn't propagate, which is fine here.
- **Deleting a top-level annotation deletes its replies**, since a thread without its opening comment has no context.
- **Empty annotations are rejected on the server** (trimmed, then must be non-empty); the Post button is also disabled client-side.

## Tradeoffs

- **The event bus lives in one process.** With several API servers, a write on one wouldn't reach viewers connected to another. To scale out, publish through Redis pub/sub or a MongoDB change stream instead; `events.ts` is the only file that changes.
- **SSE rather than WebSockets.** Updates only flow server → client (writes are ordinary REST calls), and the browser's `EventSource` reconnects on its own. WebSockets would be worth it for chatty two-way features like presence or typing indicators.
- **No real auth**, as the exercise allows: anyone can claim any user id.

## Project layout

```
server/src/   Hono app (app.ts), services/ (readings, annotations), events.ts, schemas.ts, seed.ts, tests
web/src/      Vue app: reading list, reading page + discussion feed, typed API client
scripts/      dev MongoDB launcher
```

## Tests

`npm test` runs Vitest; the server tests use a throwaway MongoDB:

- `api.test.ts` calls the real app over HTTP (auth, role middleware, validation): `GET /api/readings` returns the right annotation and student counts per reading (replies included, zero for an untouched reading); `POST /api/readings` lets instructors create (input trimmed, new reading listed first) and gives students 403, unknown users 401, and a blank title or description 400; annotation routes let students post and anyone read, give instructors 403 on every write, and reject empty annotations (400) and unknown readings (404); and the live stream opens immediately and pushes new annotations to a connected client.
- `annotations.test.ts` covers the annotation service: events reach only that reading's subscribers, edits are published and marked edited, deleting a root deletes its replies (and publishes one `deleted` event), only authors can edit or delete, replies are one level deep, listing is newest first, and empty annotations are rejected.
- `web/src/errors.test.ts` covers how the frontend turns failures into messages: the API's own `{ error }` text, a readable message for empty or non-JSON error bodies (like the empty 502 Vite's proxy sends while the API restarts), and a network failure.
