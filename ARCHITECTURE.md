# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router, TypeScript strict | Serverless-compatible, file-based routing, RSC for data fetching |
| Editor | Tiptap v3 on ProseMirror, open-source extensions only | Stable JSON document model, step-based transform history. Line spacing is a block node attribute (paragraph, heading), not a mark. |
| Database | Postgres on Neon, Drizzle ORM 0.45.4 | Serverless Postgres, free tier, wire-compatible with PGlite for tests |
| Auth | bcryptjs + jose HS256 session cookie, hand-rolled | No third-party auth service, no paid tier dependency |
| Validation | zod on every request body and query | Uniform error shape, coercion, type inference |
| Tests | Vitest + PGlite (in-memory Postgres in WASM) | No external database in CI, fast, full SQL fidelity |
| Deploy | Vercel (serverless) + Neon, both free tier | Zero paid services required |

---

## Data model

| Table | Columns | Notes |
|---|---|---|
| `users` | id uuid, email unique, name, role (teacher\|student), password_hash, created_at | Role is set at signup, gates assignment creation |
| `documents` | id uuid, owner_id, title, content jsonb (Tiptap JSON), version int, labels text[], assignment_id nullable, created_at, updated_at | version increments on every PUT; content is full Tiptap document JSON |
| `document_shares` | id, document_id, email, user_id nullable, role (viewer\|commenter\|editor), status (pending\|active), invited_by, created_at | Pending until invited email signs in; unique(document_id, email) |
| `attachments` | id, document_id, uploader_id, kind (image\|file), filename, mime, size, data bytea, created_at | Stored in Postgres, served through access-checked route |
| `doc_events` | id, document_id, seq int, user_id, kind, steps jsonb, inserted int, deleted int, checkpoint jsonb nullable, client_t int, received_at timestamptz | Append-only; unique(document_id, seq); checkpoint at seq 0 and every 100 events |
| `comments` | id, document_id, author_id, parent_id nullable, anchor_id text, body, resolved bool, created_at | Schema only; no API routes or UI built yet |
| `classes` | id, teacher_id, name, created_at | Teacher-owned roster |
| `class_members` | id, class_id, user_id nullable, email, status (pending\|active), created_at | Pending until email activates via sign-in or sign-up |
| `assignments` | id, class_id, teacher_id, title, instructions jsonb, due_at timestamptz, template_doc_id nullable, created_at | Instructions stored as Tiptap JSON |
| `submissions` | id, assignment_id, student_id, document_id, status (not_started\|in_progress\|submitted), first_submitted_at, submitted_at, is_late bool, **feedback text nullable**, **feedback_updated_at timestamptz nullable** | feedback and feedback_updated_at added in migration 0001; teacher writes via PATCH /api/assignments/[id]/feedback |

Foreign keys: shares, events, attachments, and submissions all reference documents and users with cascade delete. `documents.assignment_id` does not carry a foreign key to `assignments` (circular dependency with `assignments.template_doc_id` enforced at the application layer instead).

---

## Access rules

One function: `getDocAccess(userId, docId)` in `src/server/access.ts`. Returns `owner | editor | commenter | viewer | null`. Every API route that touches a document calls it; nothing else makes access decisions.

Rules checked in order:
1. User is the document owner: returns `owner`.
2. Active `document_shares` row for this userId (or matching email): returns its role.
3. User is the teacher of the assignment linked to this document: returns `commenter`. They can read and comment, never edit.
4. Otherwise: returns `null` (404 to the caller, existence is not revealed).

Pending shares grant nothing until the invited email signs in or signs up, then the share is activated. A student's submission document locks (no further PUT) after the deadline once the student has submitted.

---

## Replay event model

Events are written by the client recorder (`src/features/replay/recorder.ts`) on every Tiptap transaction and flushed to `POST /api/docs/:id/events` every 2 seconds, on blur, and via `sendBeacon` on page hide.

Each event carries:
- `steps`: ProseMirror step JSON array, the exact edit operations
- `kind`: type, paste, delete, format, undo, import, or other
- `inserted` / `deleted`: character counts
- `client_t`: milliseconds since session start (clamped server-side, cannot run ahead of real elapsed time)
- `received_at`: server timestamp, used as the authoritative time for facts

The server enforces that `seq` is contiguous, rejects gaps or duplicate sequences, and never accepts edits or deletes of past events.

**Checkpoints** (full Tiptap JSON snapshots) are stored at seq 0 and at every 100 events. The replay player seeks to the nearest checkpoint behind the target position, then applies steps forward with `Step.fromJSON(schema, stepJson)`. This keeps seek latency low without storing a snapshot for every event.

**Facts panel** computes: active writing time (gaps over 2 minutes are counted as idle between sessions), session count, revision count, paste events by size, and percentage of inserted characters by source (typed, pasted, imported). Per-author attribution uses the same metrics split by `userId`.

---

## Concurrency

Every `PUT /api/docs/:id` sends `baseVersion`. If the server's stored version is higher, it returns `409 Conflict` with the current version. The UI shows a banner with two options: reload from server (discards local changes) or keep my version (saves local content as a new document). No data is overwritten silently.

The autosave loop is single-flight: a second save will not start until the first completes. The loop uses refs (`versionRef`, `dirtyRef`, `savingRef`) so it always reads current state rather than captured closures.

---

## Uploads and file storage

**Import (new document):** `.docx` via mammoth, `.md` via marked, `.txt` direct. 4 MB cap set by Vercel's 4.5 MB function body limit. Stated in the UI next to the import button.

**Attachments (added to an existing document):** png, jpg, gif, webp, pdf, docx, txt, md, csv. 4 MB cap. Stored as `bytea` in Postgres. Served through `GET /api/files/:id`, access-checked with `getDocAccess`.

No S3 or external storage. This keeps deployment within zero paid services, and allows the test suite to verify file round-trips with PGlite. The tradeoff is that large files slow down the database; compaction or migration to object storage would be needed at scale.

---

## Known limits and gaps

| Limit | Detail |
|---|---|
| Upload cap | 4 MB, set by Vercel function body limit |
| docx conversion | mammoth flattens complex tables, drops footnotes, endnotes, charts, SmartArt; images extracted as attachments |
| No live co-editing | Vercel serverless has no persistent state or connection upgrade support |
| No comment API | Schema and commenter role exist; API routes and UI not built |
| No export | Import works; no export route |
| Zod 3.x DoS advisory | GHSA-mrhx-c7xc-m3w5, affects oversized constrained collections; zod 4 migration is a breaking change, not done in this scope |
| Events table grows unbounded | No compaction or archiving implemented |
