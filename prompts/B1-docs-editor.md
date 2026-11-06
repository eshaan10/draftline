Read CLAUDE.md and PLAN.md. Task B1: documents and the editor. Budget: 35 minutes.

Build:
1. API (all via zod + getDocAccess, even though sharing arrives in B2, write getDocAccess now with owner-only logic and a clean shape so B2 extends it):
   - `GET /api/docs` list for the signed-in user (owned now, shared later), `POST /api/docs` create, `GET /api/docs/:id`, `PUT /api/docs/:id` (content, title, baseVersion, optimistic concurrency, returns new version, 409 on stale), `PATCH /api/docs/:id` rename only, `DELETE /api/docs/:id` (owner only).
2. `/docs` dashboard: two sections, "My documents" and "Shared with me" (the second can show an empty state until B2). Cards or rows with title, last edited (relative), an "Owned" or "Shared" badge. A "New document" button and a search box that filters by title. Empty state that explains what to do.
3. `/docs/[id]` editor page:
   - Inline-editable title (rename on blur or Enter, with saving state).
   - Tiptap v3 editor with: Bold, Italic, Underline, Headings (H1 to H3), Bullet list, Ordered list, Blockquote, Link, Horizontal rule, Undo and Redo, Placeholder, CharacterCount, TextAlign, Table (with row and column add/remove controls), Image (UI wired in B3). Use only open-source extensions.
   - A real toolbar: grouped buttons with active states, a text-style dropdown (Paragraph, H1, H2, H3), tooltips with the keyboard shortcut, accessible labels.
   - Paper-like canvas: centered page, comfortable line length, good typography.
   - Autosave: debounce 1.5s after changes and on blur. Show a status chip: "Saving...", "Saved", "Offline, will retry", "Conflict". Retry with backoff on network errors. Warn on tab close if there are unsaved changes.
   - On 409: show a non-destructive banner "This document changed elsewhere" with Reload and Keep my version (copies my content to a new doc) actions.
   - Always use `immediatelyRender: false`.
4. Loading skeletons, 404 page for missing or inaccessible docs (do not reveal whether it exists), and a global error boundary with a friendly message.
5. Tests: create, rename, save, stale baseVersion returns 409, non-owner gets 404 on someone else's doc, delete only by owner, content round-trips with formatting preserved (bold, heading, list, table).

Do the work in this order: API + tests first, then dashboard, then editor. Commit as `feat(docs): documents CRUD and rich-text editor`. Run typecheck, test and build, then tell me how to verify manually in the browser (a short checklist).
