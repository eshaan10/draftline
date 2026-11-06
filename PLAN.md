# PLAN

## Product
Draftline: a document editor where the writing process is visible to everyone (student, teacher, reviewer), with assignments built in. Framed as an authorship audit trail with education as the first use case.

## Time budget (hard stop 17:10, started ~13:50)
| Block | What | Minutes | Clock |
|---|---|---|---|
| B0 | Scaffold, DB, schema, seed, login | 10 | 13:50 |
| B1 | Docs CRUD, editor, toolbar, autosave | 35 | 14:00 |
| B2 | Sharing, pending invites, owned vs shared | 20 | 14:35 |
| B3 | Upload import, images, attachments | 20 | 14:55 |
| B4 | Replay: recorder, facts, player | 35 | 15:15 |
| B5 | Assignments, roster, copies, submit, comments | 35 | 15:50 |
| B6 | Better than Docs: dark mode, read aloud, goals | 10 | 16:25 |
| B7 | Hardening, test gaps, seed polish | 10 | 16:35 |
| B8 | Docs, deploy check, video, submission | 25 | 16:45 |

GATE at 15:50: B0 to B4 working end to end on the deployed URL. If not, cut B6 first, then attachments (keep import), then comment threads (keep view-only teacher access).
Deploy after B0 and after EVERY block. Never leave deployment to the end.
Group assignments and other stretch items only after B7 is green AND there are 30+ minutes left.

## Roles and accounts
Seeded users (password for all: `demo1234`, shown on the login page with one-click buttons):
- teacher: Ms. Rivera (`rivera@demo.test`)
- students: Ana, Ben, Cam, Dee (`ana@`, `ben@`, `cam@`, `dee@` at `demo.test`)
- `users.role` is `teacher` or `student`. Role gates assignment creation and the teacher dashboard.
Sign up is allowed (email, name, password, role) so pending invites can be demonstrated.

## Data model (Drizzle, Postgres)
- users(id uuid, email unique, name, role, password_hash, created_at)
- documents(id uuid, owner_id, title, content jsonb [Tiptap JSON], version int, labels text[], assignment_id nullable, created_at, updated_at)
- document_shares(id, document_id, email, user_id nullable, role viewer|commenter|editor, status pending|active, invited_by, created_at; unique(document_id, email))
- attachments(id uuid, document_id, uploader_id, kind image|file, filename, mime, size, data bytea, created_at)
- doc_events(id, document_id, seq int, user_id, kind type|paste|delete|format|undo|import|other, steps jsonb, inserted int, deleted int, checkpoint jsonb nullable, client_t int [ms since session start], received_at timestamptz; unique(document_id, seq))
- comments(id, document_id, author_id, parent_id nullable, anchor_id text [matches Comment mark attr], body, resolved bool, created_at)
- classes(id, teacher_id, name), class_members(class_id, user_id, email, status pending|active)
- assignments(id, class_id, teacher_id, title, instructions jsonb, due_at timestamptz, template_doc_id nullable, created_at)
- submissions(id, assignment_id, student_id, document_id, status not_started|in_progress|submitted, first_submitted_at, submitted_at, is_late bool)

## Access rules (single source: getDocAccess)
Returns `owner | editor | commenter | viewer | null`.
1. Owner of the document -> owner.
2. Active share row for the user (or matching email) -> its role.
3. Teacher who owns the assignment linked to the document -> commenter (view and comment only, never edit).
4. Otherwise null.
Pending invites grant nothing until the invited email signs in or signs up, then they are activated. A student's submission doc is locked read-only for the student after the deadline if already submitted.

## Concurrency
`PUT /api/docs/:id` takes `{ content, title?, baseVersion }`. If `baseVersion` is stale the server returns 409 with the current version; the UI shows "Someone else changed this document" with a reload action. No data is silently overwritten.

## Replay design
- Client recorder (Tiptap `onTransaction`): for each `docChanged` transaction capture `steps` (`step.toJSON()`), kind (`uiEvent === "paste"` -> paste, `"drop"` -> other, history meta -> undo, else type/delete/format by step content), inserted and deleted char counts, `client_t`.
- Buffer and flush every 2s, on blur, and on `pagehide` via `sendBeacon`. Each batch has a client `seq`; server validates it is contiguous and rejects gaps or replays.
- Server stamps `received_at`, clamps `client_t` so it cannot run ahead of real elapsed time, and never accepts edits or deletes of past events (append-only).
- Checkpoint (full doc JSON) at seq 0 (initial or imported content) and every 100 events, so seeking is fast.
- Import and upload create one event of kind `import` (counted as imported, not typed).
- Replay rebuilds state by applying steps (`Step.fromJSON(schema, json)`) from the nearest checkpoint into a read-only Tiptap editor. Paste batches get a temporary highlight in the replay only (never in the live editor).
- Facts panel (facts only, no scores, no flags, no "suspicious" language): active writing time (gaps over 2 minutes count as idle), number of sessions, revision count, paste events (timestamp, size), percent of inserted characters by source (typed, pasted, imported).
- Player: play and pause, scrub bar with paste markers, 1x, 4x, 16x, skip idle gaps toggle. Visible to the document owner, editors, and the teacher of an assignment.
- Required test: replaying all events from the first checkpoint reproduces the saved final document exactly.

## Assignment mode (solo for v1)
- Teacher creates a class (name), adds students by email (existing user -> active, unknown email -> pending), creates an assignment (title, rich-text instructions, due date, optional template document).
- Creating an assignment creates one submission and one student-owned copy of the template (or blank doc titled after the assignment) for every active class member. A student who joins later gets theirs on activation.
- Student view: Assignments list with status (not started, in progress, submitted, late), due date. Opening it shows the doc with the instructions in a split-view pane beside it.
- Submit rules (assumption, change if you disagree): submitting before the deadline is allowed any number of times (resubmit just updates `submitted_at`). After the deadline a student who has not submitted can submit once and it is marked late; after a late or on-time submission past the deadline the doc locks. `is_late` is computed on the server from `due_at`.
- Teacher dashboard per assignment: table of students with status, submitted time, late badge, active time, pasted percent, buttons Open (read and comment) and Replay.
- Teacher can comment (Comment mark + comments table, replies, resolve) and never edit.

## Better than Google Docs (sourced from user requests)
Dark mode that renders the editor properly, split-view reference pane (built in B5), read aloud with the browser SpeechSynthesis API, writing goals panel (word goal, reading time, Flesch-Kincaid grade, computed locally).
Stretch only: draggable outline that moves sections, document labels, Markdown export, group assignments, small AI helper behind an env key.

## Upload rules
- Import to a new doc: .docx, .md, .txt. Max 4MB. Stated in the UI next to the button and in the README.
- .docx via mammoth (style map so underline is kept; images intercepted and stored as attachments, not inlined). Document known conversion limits in the README.
- Attachments to a document (any of: png, jpg, gif, webp, pdf, docx, txt, md, csv) max 4MB, listed in a side panel, served through an access-checked route with correct content type and `Content-Disposition`.
- Reject with 415 for other types and 413 for size, with friendly UI text.

## Definition of done per block
Typecheck clean, tests pass, works on the deployed Vercel URL, committed, AI_LOG updated if anything real happened.
