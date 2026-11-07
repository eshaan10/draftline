# Architecture

## What was prioritized and why

The core bet is that replay fidelity and access correctness matter more than feature count. A flaky audit trail or a permission bug would undermine the whole product premise, so those two things got the most care.

The editor and replay system were built first because they are load-bearing: everything else (assignments, sharing, facts) depends on events being captured correctly. Comments were scoped to the data model but not surfaced in the UI - the assignment workflow (teacher opens student doc in read-only commenter mode, replay shows the history) covers the most important teacher use case without needing threaded comments.

---

## Data model

| Table | Purpose |
|---|---|
| `users` | email, name, role (teacher or student), bcrypt password hash |
| `documents` | title, Tiptap JSON content, version counter, owner, optional assignment link |
| `document_shares` | per-email role grant (viewer, commenter, editor), pending until email signs in |
| `doc_events` | append-only event log: ProseMirror steps, char counts, kind, server timestamp, checkpoint every 100 events |
| `attachments` | binary file data as bytea, linked to a document |
| `classes` | teacher-owned roster |
| `class_members` | student email to class link, pending until email activates |
| `assignments` | title, instructions, due date, optional template doc |
| `submissions` | one per student per assignment, tracks status and late flag |
| `comments` | schema defined, no API routes yet (see "Deliberately not built") |

Foreign keys run from shares, events, attachments, and submissions back to documents and users. The one intentional gap is `documents.assignment_id` - pointing it back to `assignments` creates a circular dependency with `assignments.template_doc_id`. Both are enforced at the application layer instead.

---

## The single access function

Every route that touches a document calls `getDocAccess(userId, docId)` in `src/server/access.ts`. It returns `owner | editor | commenter | viewer | null`. Nothing else makes access decisions.

The rules in order:
1. Owner of the document gets `owner`.
2. Active share row for the user (or matching email) returns its role.
3. Teacher who owns the assignment linked to the document gets `commenter` - they can read and comment, never edit.
4. Otherwise `null`.

Having one function means adding a new rule (group membership, public link) is a single-file change and the entire test matrix stays current automatically. `tests/access-matrix.test.ts` runs 15 cases across all role combinations.

---

## Replay design

Events are append-only. The server rejects any attempt to edit or delete a past event. Each event carries:

- ProseMirror step JSON (the exact edit, replayable)
- char counts (inserted, deleted)
- kind (type, paste, delete, format, undo, import, other)
- `client_t`: milliseconds since session start, clamped server-side so it cannot run ahead of real elapsed time
- `received_at`: server timestamp, used for the facts panel

Checkpoints (full document JSON snapshots) are stored at seq 0 and every 100 events. Replay loads the nearest checkpoint behind the target position, then applies steps forward with `Step.fromJSON(schema, stepJson)`. This keeps seek time low without storing redundant full snapshots for every event.

The required correctness test (`tests/replay.test.ts`) inserts events, replays from the first checkpoint, and asserts the resulting document text matches the saved final document. Schema differences between StarterKit (used in tests) and the full editor schema mean full JSON equality would always fail; the test asserts text content equality and annotates why.

The facts panel computes active writing time by bucketing events into sessions (gaps over 2 minutes = idle), counts paste events by size, and calculates what fraction of inserted characters came from typing vs. pasting vs. importing. Per-author attribution tracks the same stats split by user, with stable color assignment based on first-appearance order.

---

## Optimistic concurrency and no live co-editing

Every `PUT /api/docs/:id` sends `baseVersion`. If the server's stored version is higher, it returns 409 and the UI shows "This document changed elsewhere" with a reload option. No data is silently overwritten.

Live co-editing (operational transformation, CRDTs, websockets) was cut deliberately. Vercel serverless functions have no persistent state between requests and no connection upgrade support. The app runs on the free tier of both Vercel and Neon, which rules out long-lived connections. The optimistic version check is enough for the assignment use case where students write alone and teachers read.

---

## Deployment choices

**Vercel + Neon, not SQLite or a VPS.**

Neon is serverless Postgres - it scales to zero, the free tier covers this project easily, and it speaks the same wire protocol as local Postgres so there is no dev/prod mismatch. SQLite on Vercel would require a persistent disk, which the free tier does not provide. A VPS would need ongoing maintenance and cost.

Vercel's 4.5MB function body limit set the 4MB upload cap. Files are stored as `bytea` in Postgres rather than S3 to stay within the zero-paid-services constraint.

Tests run against PGlite (in-memory Postgres in WASM) so CI needs no external database.

---

## Deliberately not built

| Item | Reason |
|---|---|
| Comment API and UI | Schema and roles exist. Skipped to stay within time budget; the replay + teacher read-only access covers the core review workflow. |
| Dark mode UI toggle | CSS variables and a `[data-theme="dark"]` block are defined; the toggle button was cut in the final hardening pass to keep the header uncluttered. The theme works if `data-theme="dark"` is set manually. |
| Markdown and docx export | Import was the higher-value direction (students pasting from Word is the problem to detect). |
| Read aloud | Planned in B6; dropped to stay within time budget. The browser SpeechSynthesis API would have been the implementation. |
| Group assignments | Stretch item. Would require a submission per group member pointing to a shared document. |
| Live co-editing | Incompatible with serverless deployment and the free-tier constraint. |
