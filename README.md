# Gloss — a collaborative reading app

Instructors assign readings; students discuss them through annotations (comments on a whole reading), with replies, live updates, and edit/delete of their own posts.

**Stack:** TypeScript · Vue 3 (`<script setup>`) + Vite · PrimeVue 4 + Tailwind CSS v4 · Hono on `@hono/node-server` · MongoDB (official driver) · Zod via `@hono/zod-validator` · Vitest.

## Run it

Requires Node 20+. Nothing else to install: MongoDB is downloaded and run for you.

```bash
npm install
npm run dev        # MongoDB (:27018) + API (:3001) + web (:5173); sample data is loaded on first run
```

Open http://localhost:5173 and use **Viewing as** to pick a user:

- **Prof. Dana Reyes** (instructor): create readings with **New reading**, see each reading's annotation count and number of participating students, and read every discussion, optionally filtered to one student's threads (their posts are highlighted). **Participation** shows every student's annotation count on every reading, flagging students who haven't posted anywhere.
- **Alice, Bob, Carol** (students): browse and search readings by title (each shows its annotation count), post annotations, reply, and edit/delete your own.

The choice is per tab (`sessionStorage`), so open Alice and Bob in two tabs to watch annotations appear live.

Other commands: `npm run seed` resets the database to the sample data (`server/src/seed/`: 10 students, 2 instructors, 8 readings and about 50 annotations; `npm run seed -- --minimal` loads just the small base set the tests use), `npm test` runs the tests, `npm run typecheck` checks server and web together. `npm run lint` runs ESLint (config follows the `create-vue` defaults for Vue + TypeScript + Vitest, plus typescript-eslint's rules against unhandled promises) and `npm run format` applies Prettier; `lint:fix` and `format:check` also exist. To use your own MongoDB, set `MONGO_URI` and run `npm run dev:api` and `npm run dev:web` instead of `npm run dev`.

## How it works

```
Vue ──REST (typed hc client)──▶ Hono ──▶ MongoDB
 ▲                                │
 └──── SSE, one per open reading ◀┘ in-process event bus (realtime/events.ts)
```

- **Typed API with no codegen.** Each router in `server/src/routes/` is one chained Hono expression, and `server/src/app.ts` mounts them with a chained `.route()` and exports the resulting type; `web/src/api/client.ts` builds a client from it with `hc<AppType>`, so request and response types are checked end to end. Request bodies are validated with Zod (`schemas.ts`, via `middleware/validate.ts`), and failures come back as `{ error }` with a readable message.
- **Roles.** No real auth: the client sends the chosen user id (`x-user-id`) and the server looks the user up. Anyone can read. Creating a reading is instructor-only, posting is student-only, and editing or deleting is author-only (403 otherwise).
- **Live updates.** After each successful write, the annotation service publishes an event (`annotation` or `deleted`) on an in-process `EventEmitter`, keyed by reading. Each open SSE stream subscribes to its reading and forwards those events.
- **Counts.** `GET /api/readings` runs one aggregation over `annotations`, grouped by reading, that counts annotations (replies included) and collects distinct authors. Only students can post, so distinct authors = students participating. Nothing is stored, so counts can't drift out of date. On a reading's page the instructor's counts are computed from the live feed instead, so they update as students post.
- **Safe retries.** Each new annotation or reply gets its id in the browser (same format as server ids) before it is sent. If a request gets no answer, the client retries with the same id, and if the first attempt was in fact saved, the server returns that post instead of creating a duplicate (any other clash on an id is a 409). The Post button shows a spinner and the text stays in the box until the server confirms; the post often appears even sooner, from the live update.
- **Reconnects.** Whenever the stream (re)connects, the client reloads the reading's annotations over REST, so anything missed while disconnected is picked up without the server replaying history. Events that arrive during that reload are held and applied after it, so a slow response can't undo a newer change. A banner shows while the connection is down.

## Interface

- **Reading page in two panes.** The reading is set like a document (serif, Literata) on the left; the discussion is a sticky panel on the right, newest first, with the composer at the top (⌘/Ctrl + Enter posts). It stacks into one column on phones.
- **Live without noise.** Posts that arrive from other people while the page is open get a "New" tag, and an `aria-live` region announces them ("New annotation from Alice Chen") for screen reader users. Who else has the reading open shows under it.
- **Feedback for every action.** Toasts confirm posting, replying, editing, deleting and assigning a reading; deleting asks first (a dialog that says what will be removed); form errors appear next to the form. Anything a component doesn't handle itself reaches a global Vue error handler (`app.config.errorHandler`), which logs it and shows a generic error toast. Loading, empty and not-found states each have their own message.
- **Instructors** see counts on every reading, live counts on the reading page, a student filter on the discussion, and a sortable participation table whose student column stays put while scrolling across readings.
- **Components and theme.** PrimeVue supplies the interactive components (Select, Dialog, ConfirmDialog, Toast, DataTable, Button, inputs); Tailwind does the layout. There is one palette: an indigo preset on PrimeVue's Aura theme (`web/src/assets/theme.ts`), and the Tailwind tokens (`bg-panel`, `text-muted`, …) point at the same CSS variables. The app is light-only, by choice: one theme to design and check for contrast. The primary and danger colors are one shade darker than Aura's defaults so white text on them meets WCAG AA (4.5:1).
- **Why PrimeVue 4, not 5.** PrimeVue 5 moved to a commercial license that needs a license key; 4.x is MIT.

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

- **The event bus lives in one process.** With several API servers, a write on one wouldn't reach viewers connected to another. To scale out, publish through Redis pub/sub or a MongoDB change stream instead; `realtime/events.ts` is the only file that changes.
- **SSE rather than WebSockets.** Updates only flow server → client (writes are ordinary REST calls), and the browser's `EventSource` reconnects on its own. WebSockets would be worth it for chatty two-way features like presence or typing indicators.
- **No real auth**, as the exercise allows: anyone can claim any user id.

## Project layout

Server routes follow Hono's guide for larger apps (one router per resource, mounted with `.route()`); the web app follows the `create-vue` layout, with `@/` meaning `web/src/`.

```
server/src/
  index.ts          entry point: connect, seed an empty database, start the server
  app.ts            mounts the routers and auth, exports AppType for the client
  routes/           users, readings (incl. a reading's annotations and stream), annotations, participation
  middleware/       auth (user lookup, role checks), validate (Zod with a uniform error body)
  services/         readings, annotations, participation: the logic and database access
  realtime/         events (in-process pub/sub and presence), stream (the SSE endpoint)
  db/               connection, collections and indexes; models (document types)
  seed/             base seed and demo data
  schemas.ts        request body schemas
  test/             test setup: one MongoDB per run, a database per test file
web/src/
  api/              typed hc client, error messages, safe retries for new posts, current user
  views/            pages: reading list, reading, participation
  components/       discussion feed and a single post
  composables/      useAnnotations: a reading's live discussion and its actions
  utils/            formatting and search helpers
  assets/main.css   Tailwind entry and theme
scripts/            dev-db.ts (local MongoDB), seed.ts (npm run seed)
```

Tests sit next to the code they cover (`*.test.ts`).

## Tests

`npm test` runs Vitest. The server tests share one throwaway MongoDB, started once per run, and each test file gets its own database on it, so files can run in parallel without interfering (`server/src/test/`; a test file just calls `useTestDatabase()`):

- `server/src/app.test.ts` calls the real app over HTTP (auth, role middleware, validation): `GET /api/readings` returns the right annotation and student counts per reading (replies included, zero for an untouched reading); `POST /api/readings` lets instructors create (input trimmed, new reading listed first) and gives students 403, unknown users 401, and a blank title or description 400; annotation routes let students post and anyone read, give instructors 403 on every write, reject empty or over-5,000-character annotations and edits (400) and unknown readings (404); and an unexpected failure returns a generic 500 without exposing internal details; and the live stream opens immediately and pushes new annotations to a connected client.
- `server/src/services/annotations.test.ts` covers the annotation service: events reach only that reading's subscribers, edits are published and marked edited, deleting a root deletes its replies (and publishes one `deleted` event with just the root's id), only authors can edit or delete, a retried post with a client-chosen id returns the original rather than a duplicate, even when two copies arrive at once (and any other reuse of an id, by another user, with other words, or in another reading or thread, is refused), replies are one level deep, listing is newest first, and empty annotations are rejected.
- `web/src/api/errors.test.ts` covers how the frontend turns failures into messages: the API's own `{ error }` text, a readable message for empty or non-JSON error bodies (like the empty 502 Vite's proxy sends while the API restarts), and a network failure; an unexpected error's raw text is never shown. API responses are read with Hono's `parseResponse`, which returns the typed body or throws.
- `web/src/utils/search.test.ts` covers the reading search: matching any part of a title regardless of case and accents, and an empty search matching everything.
- `web/src/api/retry.test.ts` covers the client half of safe retries: a request that got no answer is retried after 1s and then 2s, at most three tries, while an answer from the server (even an error) is never retried; new ids are 24 hex characters that pass the server's own validation, and don't repeat.
