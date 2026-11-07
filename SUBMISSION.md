# Submission

**Candidate:** Eshaan Punalekar
**Role:** Full Stack Product Engineer, Ajaia
**Live URL:** https://draftline.vercel.app *(placeholder - update before submission)*
**Video:** See VIDEO_URL.txt *(not yet recorded)*

---

## What is included

### Core files
- `src/server/schema.ts` - Drizzle schema: 10 tables, enums, indexes
- `src/server/db.ts` - DB helper (Neon at runtime, PGlite in tests)
- `src/server/auth.ts` - Hand-rolled auth: bcrypt, jose session cookies
- `src/server/access.ts` - Single access function (`getDocAccess`)
- `scripts/seed.ts` - Idempotent demo seed with realistic editing history
- `drizzle/0000_init.sql` - Single migration file

### Pages (8 routes)
- `/login`, `/signup` - Auth with one-click demo buttons
- `/docs` - Dashboard: owned documents, shared documents, import
- `/docs/[id]` - Document editor with toolbar, autosave, sharing, attachments
- `/docs/[id]/replay` - Replay player with scrub bar, facts panel, per-author attribution
- `/classes`, `/classes/[id]` - Teacher class management and roster
- `/assignments`, `/assignments/[id]` - Assignment creation (teacher) and submission (student)

### API routes (20 handlers)
- Auth: login, signup, logout
- Docs: CRUD, shares, attachments, events, replay
- Classes: create, detail, members
- Assignments: create, detail, submit
- Files: access-checked file serving
- Import: .docx/.md/.txt conversion
- Health: `GET /api/health` returns `{ok: true}`

### Feature files (src/features/)
- `editor/`: Toolbar, DocumentWorkspace, OutlineSidebar, LinkPopover, ShareDialog, Tiptap extensions
- `docs/`: DocsDashboard, relativeTime
- `classes/`: ClassesPage, ClassDetailPage
- `assignments/`: StudentAssignmentPage, TeacherAssignmentDashboard
- `upload/`: AttachmentsPanel, ImportButton
- `replay/`: ReplayPlayer, recorder, authorColors, pasteHighlight extension, facts, authorHighlight extension

### Tests (65 tests, 8 files)
All run against PGlite. No external database needed to run tests.

---

## Demo credentials

Password for all accounts: `demo1234`

| Email | Role | Demo story |
|---|---|---|
| rivera@demo.test | Teacher | Has one class, two assignments, shared syllabus doc |
| ana@demo.test | Student | Has realistic edit history on personal essay, submitted |
| cam@demo.test | Student | Submitted on time |
| dee@demo.test | Student | Did not submit before deadline, shows Late badge |
| ben@demo.test | Student | Not started |

---

## How to run locally

```bash
cp .env.example .env.local
# set DATABASE_URL and SESSION_SECRET in .env.local
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Tests (no database needed):
```bash
npm test
npm run typecheck
```

---

## What works

- Document creation, editing, autosave (optimistic version check, 409 on conflict)
- Rich text toolbar: headings, bold/italic/underline, font family and size, colors, highlight, lists, alignment, link, image, table, horizontal rule, line spacing, undo/redo
- Sharing: invite by email, role selection (viewer/commenter/editor), pending invites activated on sign-in, role changes, revocation
- File import: .docx (via mammoth), .md, .txt, max 4MB
- Attachments: upload and serve files linked to a document
- Replay: full editing history, play/pause, scrub, 1x/4x/16x speed, skip idle, paste markers
- Facts panel: active writing time, session count, revision count, paste events, source breakdown (typed/pasted/imported)
- Per-author attribution: stable color assignment, per-author stats, inline highlights during replay
- Classes: teacher creates class, adds students by email, pending invite activated on signup
- Assignments: teacher creates with instructions and due date, student gets a copy, submit before or after deadline, late flag computed server-side
- Teacher dashboard: student submission table with status, submitted time, late badge, links to open and replay each submission
- Outline sidebar: live heading navigation
- Access control: single `getDocAccess` function, teacher gets commenter access to assignment docs

## What is incomplete or partial

- **Comments:** The database schema and commenter role are fully defined. No API routes or UI components were built. The teacher can open a student's document in read-only mode via the assignment dashboard but cannot leave inline comments.
- **Dark mode UI toggle:** CSS variables and a `[data-theme="dark"]` block are defined in globals.css. No toggle button in the UI - the theme does not activate without manually setting `data-theme="dark"` on the document element.
- **Export:** Import works (.docx, .md, .txt). No export from the editor.

---

## What I would build next with 2 to 4 more hours

1. **Comment threads.** The schema is already there. Add `POST /api/docs/:id/comments`, a floating comment UI anchored to selected text, and a sidebar for the teacher to resolve threads. This completes the review workflow.
2. **Dark mode toggle.** One button in the header that sets `data-theme` on `document.documentElement` and persists the preference in localStorage. The CSS is already written.
3. **Markdown export.** A `GET /api/docs/:id/export?format=md` route using a ProseMirror serializer. Useful for students who want to keep their work outside the app.
4. **Versions diff.** A side-by-side or inline diff view between two replay checkpoints, so teachers can quickly see what changed between drafts without watching the full replay.

---

## Walkthrough video

Video URL: see VIDEO_URL.txt

The video has not been recorded yet. VIDEO_NOTES.md contains the full talk track and timestamp plan.
