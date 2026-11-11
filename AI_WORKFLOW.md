# AI Workflow

**Tool used:** Claude (claude-sonnet-4-6 via Claude Code CLI) for the entire build. No other AI tools, no Copilot, no ChatGPT.

---

## How the build was structured

The project was planned in markdown files before any code was written. CLAUDE.md holds engineering rules (stack, constraints, naming conventions, the no-em-dash rule). PLAN.md holds the full data model, access rules, replay design, assignment logic, and a time budget split into eight milestone blocks (B0 through B8). Each milestone was then written as a separate prompt file (prompts/B0-setup.md through prompts/B8-docs.md) containing an explicit task list, test requirements, and a commit message.

Claude Code ran in a single project folder. When sessions overlapped, explicit rules in CLAUDE.md defined which files each session owned to prevent conflicts. This meant Claude could be pointed at a specific milestone prompt without needing to re-explain the data model or access rules each time.

The gate rule in PLAN.md ("B0 to B4 working end to end before B6") forced a prioritization decision: the original B6 entry in the prompt pack was cancelled after the initial submission pass to stay within the time budget. A revised B6 session, run separately, built dark mode, writing goals, teacher feedback, and read aloud. The git log shows this: the B8 docs commit precedes all four B6 feature commits.

---

## Where AI materially sped things up

**Schema and boilerplate.** The Drizzle schema covers ten tables with enums, UUID primary keys, indexes, and self-referential foreign keys (the comments parent reference). Writing that by hand against a spec would have taken 30 to 45 minutes. With Claude it was one pass, then typecheck to catch edge cases.

**ProseMirror internals.** The seed script needed to generate realistic editing history as real ProseMirror steps, not fake JSON. The correct API (ReplaceStep, Slice, Fragment, the difference between Transform and Step) is not documented clearly. Claude worked through it faster than reading the ProseMirror source would have. It still got it wrong once (see below).

**Test scaffolding.** The access matrix test (15 cases across all role combinations) and the replay fidelity test would have been tedious to set up by hand. Claude scaffolded the PGlite harness, the per-role fixtures, the step-replay assertion, and the concurrency fixtures in roughly the time it would have taken to write one of those tests manually.

**Next.js 15 App Router patterns.** Async params, the `cookies()` await requirement, `export const runtime = "nodejs"` on routes that use mammoth or Node Buffers, `immediatelyRender: false` on Tiptap editors - these are look-up tasks where AI assistance has near-zero error rate.

**Security upgrade.** When the status audit identified the drizzle-orm SQL injection advisory (GHSA-gpj5-g38j-94v9), Claude ran the upgrade, grepped the codebase for dynamic identifier usage, confirmed there was no exposure, ran the full test suite, and committed the fix in under ten minutes.

---

## What AI-generated output I changed or rejected

All entries below come directly from AI_LOG.md. No events are invented.

**B1 - autosave race condition.** The initial save implementation used `useCallback` with an empty dependency array. This captured the first `save` closure, which meant every debounce timer sent the initial `baseVersion` regardless of how many saves had completed since mount. A single user typing quickly would trigger false "document changed elsewhere" banners. The fix required redesigning the save loop using refs (`versionRef`, `latestContentRef`, `dirtyRef`) so each save reads current state rather than captured state. The concurrency test (`tests/concurrency.test.ts`) was written specifically to catch this class of bug.

**B3 - mammoth image handler typing.** The generated import route called `mammoth.images.inline`, which does not exist in the type definitions. Replaced with `mammoth.images.imgElement` and `element.readAsBuffer()`. Caught by TypeScript.

**B4 - replay fidelity test equality.** The first version of the replay test asserted full JSON document equality between the replayed state and the stored document. Steps built in the test environment use the StarterKit schema, which produces different paragraph attributes than the full editor schema (`textAlign`, `lineHeight`). The assertion would always fail. Decision: assert text content equality instead, with an annotation in the test explaining why full JSON equality is not used.

**B7 - ProseMirror Transform API.** The seed script called `Transform.insertText(text, from)`. That method does not exist on the Transform class (TypeScript TS2339). Fixed by constructing `ReplaceStep(from, to, new Slice(Fragment.from(schema.text(text)), 0, 0))` directly, with two helper functions. Caught by typecheck before the script ran.

**B6 - drizzle upgrade breaking .returning().** After upgrading drizzle-orm from 0.38.3 to 0.45.4, the feedback route called `.returning({ id: submissions.id, feedback: submissions.feedback })` with an explicit column map. The new version's types do not accept arguments to `.returning()` in this driver. TypeScript caught it (TS2554). Fixed by calling `.returning()` with no arguments.

**B6 - signup() signature in tests.** The feedback test setup called `signup(email, name, password, role)` with four positional arguments. The actual function signature takes a single object `{ email, name, password, role }`. Caught by typecheck. Fixed by removing the unused signup call and activating the member row directly via a database update instead.

**Line spacing (manual testing).** The initial line spacing implementation used `LineHeight` from `@tiptap/extension-text-style`. Its `setLineHeight` command calls `setMark("textStyle", { lineHeight })` regardless of the `types` configuration, applying line-height as an inline span style rather than a block attribute. With a caret (no selection), mark commands do nothing. `editor.getAttributes("paragraph").lineHeight` always returned null so the toolbar never reflected the current value. Found in manual testing. Rebuilt as a custom `BlockLineHeight` extension using `addGlobalAttributes` on paragraph and heading with `setNodeMarkup` to update block attrs across the selection. Six unit tests added.

**Trimmed scope.** B1 included an in-chat editor polish sub-task (B1b: page-size canvas, toolbar extras, smart typing, outline panel, document thumbnails, card menu). The card menu was trimmed for time; the rest shipped in commit `8de2bce`. The original B6 prompt entry was cancelled entirely after the initial submission pass; a revised B6 built in a later session added dark mode, writing goals, teacher feedback, and read aloud.

---

## How I verified correctness, UX quality, and reliability

**Typecheck first.** `npm run typecheck` (strict TypeScript) ran after every block. It caught the mammoth typing issue and the ProseMirror Transform error before any test ran. After the drizzle upgrade it caught both B6 bugs before they reached the test runner.

**85 tests across 10 files, all on PGlite.** PGlite runs Postgres in WASM in the same process as the test runner. No external database is needed to run the full suite.

| File | Tests | What it covers |
|---|---|---|
| auth.test.ts | 3 | signup, login, duplicate email |
| docs.test.ts | 7 | create, read, update, sharing flows |
| concurrency.test.ts | 3 | optimistic version check, rapid saves, 409 on stale base |
| access-matrix.test.ts | 15 | all role combinations for every endpoint |
| replay.test.ts | 15 | step fidelity (StarterKit and full schema), line spacing attr roundtrip, facts, session counting, per-author attribution |
| assignments.test.ts | 16 | create, submission, late flag, teacher access, feedback permissions |
| upload.test.ts | 8 | size limit, MIME validation, extension rejection, bytea round-trip |
| preview.test.ts | 4 | server-side HTML preview generation |
| readability.test.ts | 7 | Flesch-Kincaid grade function with fixed inputs including edge cases |
| lineheight.test.ts | 7 | block-level line spacing: caret, selection, heading, list item, clear, AttrStep classification |

**Replay fidelity test.** `tests/replay.test.ts` inserts a sequence of events with real ProseMirror steps, then replays from the first checkpoint by calling `Step.fromJSON(schema, stepJson)` on each event and asserts the resulting document text equals the stored final document. This is the strongest correctness check for the audit trail feature.

**Access matrix test.** Fifteen cases covering owner, editor, commenter, viewer, unauthenticated, and the teacher-of-assignment rule, against every relevant HTTP method. If the single access function drifts, this test fails.

**Manual walkthrough.** Each feature block was verified by running `npm run dev` and walking through the UI: creating and sharing documents, importing a .docx file, watching replay, creating an assignment as a teacher, submitting as a student, checking the teacher dashboard for late and submitted status.
