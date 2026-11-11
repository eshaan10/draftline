# Submission

**Candidate:** Eshaan Punalekar
**Role:** Full Stack Product Engineer, Ajaia
**Live URL:** https://draftline-rouge.vercel.app
**Video:** <VIDEO_URL>
**Repo:** https://github.com/eshaan10/draftline

---

## What I built and why

Draftline is a document editor with an append-only editing history that any teacher, reviewer, or trainer can replay at any point in time. The core idea is that the writing process itself carries information that the finished document does not: who typed what, what was pasted from somewhere else, how many revisions a draft went through, how long a student actually spent writing versus idle.

Education is the first concrete use case because the trust problem is acute there: teachers need to know whether a student wrote their own work, and existing tools either block AI tools bluntly (which escalates the arms race) or flag text probabilistically (which produces false accusations). An accurate, tamper-evident audit trail of every keystroke sidesteps that problem entirely. The same replay infrastructure would transfer to any review or training workflow where provenance matters.

The product has assignments built in. A teacher creates a class, adds students by email, and creates an assignment with instructions and a due date. Each student gets their own copy of a template document (or a blank one). The student writes in the document, submits before or after the deadline, and the teacher sees a live dashboard with submission status, late flags, and a one-click path to open and replay each student's document. A teacher feedback field was added so teachers can leave written notes per submission.

---

## Live URL and demo accounts

**https://draftline-rouge.vercel.app**

One-click sign-in buttons for all accounts are on the login page. No signup required to explore the demo.

| Email | Password | Role | Demo story |
|---|---|---|---|
| rivera@demo.test | demo1234 | Teacher | Has one class (Period 3 English), two assignments, one shared syllabus doc |
| ana@demo.test | demo1234 | Student | Has a realistic edit history on "Personal essay", submitted on time |
| cam@demo.test | demo1234 | Student | Submitted on time |
| dee@demo.test | demo1234 | Student | Submitted late, shows Late badge |
| ben@demo.test | demo1234 | Student | Has not started |

### 3-minute test path

1. **Sign in as Rivera.** From the dashboard, open the shared document "Class syllabus". Click Share in the header to see Ana (viewer), Ben (editor), and a pending invite. Close the dialog.
2. **Go to Assignments.** Click into "Personal essay". The teacher dashboard shows Ana (submitted), Cam (submitted), Dee (submitted late), Ben (not started). Click Replay next to Ana's row.
3. **Watch the replay.** Hit Play and watch Ana's editing history unfold. The facts panel on the right shows session count, active writing time, paste events, and source breakdown. Use the speed control or scrub bar to skip ahead.
4. **Leave feedback.** Back on the assignment page, click "Add feedback" next to Ana's row. Type a note and save it.
5. **Sign in as Ana.** Go to Assignments and open "Personal essay". The document is shown in split view with the assignment instructions on the left. The teacher feedback appears below.
6. **Back to the dashboard.** Open any document. Try the Writing goals panel at the bottom of the editor, the dark mode toggle in the header, and the read-aloud button in the toolbar.

---

## What works

All features listed below are tested (86 tests, 10 files, all run against PGlite with no external database needed).

**Documents:** create, rename, delete. Rich text toolbar: headings (H1-H3), bold, italic, underline, font family and size, text color, highlight, bullet and ordered lists, blockquote, text alignment, line spacing (paragraph-level, applied to the selection or the current paragraph), link, insert image, insert table, horizontal rule, undo, redo. Autosave every 1.5 seconds with a status chip. 409 on stale version with a non-destructive banner and reload option.

**Sharing:** invite by email, four roles (viewer, commenter, editor, owner), pending invites activated on first sign-in, role changes, revocation. Owned and shared document sections on the dashboard.

**Import:** .docx (via mammoth), .md, .txt. 4 MB limit stated in the UI. Drag a file anywhere on the dashboard to import it.

**Attachments:** upload files to any document, served through an access-checked route.

**Replay:** full editing history, play/pause, scrub bar with paste markers, 1x/4x/16x speed, skip idle gaps. Per-author attribution with stable color assignment and inline highlights. Facts panel: active writing time, session count, revision count, paste events, source breakdown (typed vs. pasted vs. imported).

**Classes and assignments:** teacher creates class, adds students by email, creates assignment with instructions and due date. Each student gets their own document copy. Submit, resubmit before deadline, one late submission allowed after deadline, then locks.

**Teacher dashboard:** submission status table with late badge, submitted time, links to open and replay each student's document, inline feedback field.

**Outline sidebar:** live heading navigation in the editor.

**Dark mode toggle:** cycles Auto / Light / Dark, persisted in localStorage, no flash on load.

**Writing goals panel:** collapsible, word count, character count, reading time, Flesch-Kincaid grade, optional word goal with progress bar, goal persisted per document.

**Read aloud:** toolbar button using SpeechSynthesis, reads selection or full document, play/pause/resume/stop, 5 speed levels, hidden when the browser API is absent.

---

## Product decisions and tradeoffs

**Single access function.** `getDocAccess(userId, docId)` in `src/server/access.ts` is the only place access decisions are made. Every API route that touches a document calls it. This makes adding a new rule (group membership, public link sharing) a one-file change with the full 15-case test matrix already in place. The tradeoff is that the function signature must stay stable as the app grows.

**Server time is authoritative.** Submission late flags, event timestamps, and autosave conflict detection all use `received_at` from the server. The client sends `client_t` (milliseconds since session start) for in-session timing in the replay, but the server clamps it so it cannot run ahead of real elapsed time. This matters because a student's clock or a timezone bug cannot retroactively change a late flag.

**Optimistic concurrency instead of live co-editing.** Every `PUT /api/docs/:id` sends `baseVersion`. If the stored version is higher, the server returns 409 and the UI shows a non-destructive banner. No data is overwritten silently. Live co-editing (CRDTs, operational transformation, websockets) was cut deliberately: Vercel serverless functions have no persistent state between requests and do not support connection upgrades on the free tier. The optimistic check is sufficient for the assignment use case where students write alone and teachers read.

**Files in Postgres, not S3.** Attachments and imported file data are stored as `bytea` columns. This avoids any paid external service, keeps the deployment to Vercel plus Neon (both free tier), and means the test suite can verify file round-trips with PGlite. The tradeoff is that large files slow down the database. The 4 MB upload cap comes from Vercel's 4.5 MB function body limit and is stated in the UI next to the import button.

**Append-only event log.** No event can be edited or deleted after it is written. The server rejects any attempt to do so. This is what gives the audit trail its integrity: a student cannot retroactively remove a paste event. The tradeoff is that the events table grows indefinitely; compaction or archiving would be needed at scale.

---

## What is not built or limited

**Markdown and docx export.** Import is built (.docx, .md, .txt). No export from the editor. A `GET /api/docs/:id/export` route using a ProseMirror serializer would be the implementation.

**Inline comments.** The database schema defines a `comments` table and the commenter role is fully wired through access control. No API routes or UI components for comment threads were built. The teacher can open a student's document in commenter mode and leave written feedback via the assignment dashboard instead.

**Persistent authorship overlay.** Per-author highlights flash transiently during replay at the step they were written. There is no persistent heatmap mode in the live editor showing which author wrote which text.

**Group assignments.** Each assignment creates one document per student. Group submissions (one shared document per team) are not implemented.

**Live co-editing.** One person edits at a time; concurrent edits from two browsers on the same document produce a 409 and a reload prompt. See concurrency tradeoff above.

**No AI feature inside the product.** There is no AI writing assistant, plagiarism detector, or text classifier embedded in the product. The audit trail is intentionally evidence-only: it shows what happened without scoring or flagging it.

**Zod 3.x DoS advisory (GHSA-mrhx-c7xc-m3w5).** Zod 3.25.76 is installed. Version 4.6.6+ fixes a memory exhaustion bug on oversized constrained collections. Upgrading to zod 4 is a breaking API change that would require migrating all schemas; it was not done within the time budget. All inputs go through Neon serverless which enforces its own payload limits before they reach the validation layer.

---

## AI-native workflow

See [AI_WORKFLOW.md](AI_WORKFLOW.md) for the full account. The short version:

The whole build was planned in markdown files before any code was written: CLAUDE.md holds the engineering rules, PLAN.md holds the data model, access rules, and time budget, and milestone prompts B0 through B8 each contained an explicit task list. Claude Code ran in a single project folder with explicit collision rules (one active session at a time per file area) to avoid conflicts when sessions overlapped.

The original B6 entry in the prompt pack was cancelled after the initial submission pass to stay within the time budget. A revised B6 session, run separately, built dark mode, writing goals, teacher feedback, and read aloud. The drizzle security upgrade and teacher feedback permission matrix also came from that session.

Five real bugs caught and fixed during the build are recorded in [AI_LOG.md](AI_LOG.md). Two additional bugs were caught during the drizzle upgrade in B6 and logged there.

---

## Included in the Drive folder

- Source code zip (or link to https://github.com/eshaan10/draftline)
- README.md
- ARCHITECTURE.md
- AI_WORKFLOW.md
- SUBMISSION.md
- VIDEO_URL.txt
- Screenshots folder
- Live URL: https://draftline-rouge.vercel.app

---

## How to run and test

**Requirements:** Node 18 or 20. A Postgres database (free Neon or local Postgres, no paid services required).

```bash
git clone https://github.com/eshaan10/draftline
cd draftline
cp .env.example .env.local
# edit .env.local: set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Generate a session secret: `openssl rand -base64 32`

**Tests** (no external database needed):
```bash
npm test          # 86 tests across 10 files, all use in-memory PGlite
npm run typecheck # strict TypeScript, zero errors
```

See [README.md](README.md) for the full setup guide, environment variables, and upload limits.

---

## What I would build next

**Inline comment threads** (2 hours). The schema and commenter role are already there. Add `POST /api/docs/:id/comments`, a floating comment bubble anchored to selected text, and a sidebar for the teacher to resolve threads. This completes the review workflow.

**Persistent authorship overlay** (3 hours). A toggle in the editor toolbar that colors each span of text by which author wrote it, using the same color assignments from the replay. Currently this only appears as a transient highlight during replay.

**Markdown and docx export** (1 hour). A `GET /api/docs/:id/export?format=md` route using a ProseMirror markdown serializer. Useful for students who want to keep their work outside the app.

**Zod 4 migration** (2 hours). Upgrade to zod 4.6.6+ to fix the DoS advisory. The API change is mechanical but touches every schema in the codebase.

**AI-assisted review summary** (3 hours). After a teacher opens a student's replay, offer a "Summarize this draft session" button that calls the Claude API with the edit sequence and produces a one-paragraph note about writing patterns (heavy revision vs. linear, high paste ratio vs. typed). The audit trail is the perfect input for this.
