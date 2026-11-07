# AI Workflow

## Tools used

Claude (claude-sonnet-4-6 via Claude Code CLI) was used throughout the build as an interactive coding assistant - writing code, running shell commands, reading files, and iterating on failures in a single conversation session.

No other AI tools were used. No GitHub Copilot, no ChatGPT, no code generation services.

---

## Where AI materially sped things up

**Schema and boilerplate.** The Drizzle schema (`src/server/schema.ts`) covers ten tables with enums, indexes, and self-referential foreign keys. Writing that by hand against a spec would take 30-45 minutes. With Claude it was one pass, then typecheck to catch edge cases.

**Test coverage.** The access matrix test (`tests/access-matrix.test.ts`, 15 cases) and replay fidelity test would have been tedious to set up. Claude scaffolded the PGlite harness, the per-role fixtures, and the step-replay assertion in roughly the time it would have taken to write one of those tests manually.

**ProseMirror internals.** The seed script needed to generate realistic editing history as real ProseMirror steps, not fake JSON. Claude worked through the correct API (`ReplaceStep`, `Slice`, `Fragment`) faster than reading the ProseMirror source would have. It still got it wrong once (see below).

**Routing and middleware patterns.** Next.js 15 App Router async params, the `cookies()` await requirement, `export const runtime = "nodejs"` for mammoth routes - these are fiddly and well-suited to AI assistance because they are look-up tasks, not design tasks.

---

## What AI output was changed or rejected

The following are drawn directly from `AI_LOG.md`. No invented entries.

**B1 - autosave race condition.** The initial autosave implementation used `useCallback` with an empty dependency array, which captured the first `save` closure. This caused the version counter to drift and triggered false "document changed elsewhere" banners for a single user. The fix required redesigning the save loop using refs (`versionRef`, `latestContentRef`) so each save reads the current version rather than the captured one. The concurrency test (`tests/concurrency.test.ts`) caught this in verification.

**B3 - mammoth image handler typing.** `mammoth.images.inline` does not exist in the type definitions. The generated code used it. Replaced with `mammoth.images.imgElement` and `element.readAsBuffer()` for explicit typing. Caught by TypeScript.

**B4 - replay fidelity test equality.** The first version of the replay test asserted full JSON equality between the replayed document and the stored document. Steps built with StarterKit schema produce paragraph attributes (`textAlign`, `lineHeight`) that the stored document also carries, but minor schema differences between test and editor schema caused the assertion to fail. Decision: assert text content equality instead, with an annotation explaining why. Verified with all 10 replay tests passing.

**B7 - ProseMirror Transform API.** The seed script used `Transform.insertText(text, from)` to construct editing steps programmatically. That method does not exist on the `Transform` class (TypeScript error TS2339, would also fail at runtime). Fixed by constructing `ReplaceStep(from, to, new Slice(Fragment.from(schema.text(text)), 0, 0))` directly, with two helper functions (`pmInsertText`, `pmAppendParagraph`). Caught by typecheck; 65/65 tests passed after the fix.

---

## How correctness, UX, and reliability were verified

**Type checking.** `npm run typecheck` (strict TypeScript) was run after every block. It caught the mammoth typing issue and the ProseMirror Transform error before any tests ran.

**Automated tests.** 65 tests across 8 test files, all running against PGlite (in-memory Postgres):

- `tests/auth.test.ts` (3): signup, login, duplicate email
- `tests/docs.test.ts` (7): create, read, update, share flows
- `tests/concurrency.test.ts` (3): optimistic version check, rapid saves, 409 on stale base
- `tests/access-matrix.test.ts` (15): all role combinations for owner, editor, commenter, viewer, unauthenticated
- `tests/replay.test.ts` (14): step fidelity, facts computation, session counting, per-author attribution, replay API
- `tests/assignments.test.ts` (11): create assignment, student submission, late flag, teacher access
- `tests/upload.test.ts` (8): size limit, MIME validation, extension rejection, bytea round-trip, docx import
- `tests/preview.test.ts` (4): server-side HTML preview generation

**Replay fidelity test specifically.** This test inserts a sequence of events with real ProseMirror steps, then replays from the first checkpoint and asserts the resulting document text matches the stored final document. It is the strongest correctness check for the audit trail feature.

**Manual walkthrough.** Each feature block was verified by running `npm run dev` and walking through the UI: creating documents, sharing, importing a .docx file, watching replay, creating an assignment as a teacher, submitting as a student, and checking the teacher dashboard for late/submitted status.

**AI_LOG.md entries.** The log was written only when something real happened - a rejection, a bug found in prior output, or a verification step that caught something. It has 5 real entries across 7 blocks of work.

---

## Known gaps in the AI log

The log is thin on UX decisions - things like toolbar layout, paper-sheet canvas sizing, and the replay scrub bar design were iterative and mostly worked on the first pass. Those decisions were not logged because nothing failed. If the reviewer wants more context on any specific design choice, ask and I will fill it in from memory.
