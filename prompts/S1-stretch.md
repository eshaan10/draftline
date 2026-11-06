Read CLAUDE.md and PLAN.md. STRETCH work. Only start if B7 is green and at least 30 minutes remain before the code freeze. Pick ONE, finish it, then stop. Ask me which.

Option A: Group assignments (the user asked for this if time allows)
- Assignment mode `group` with group size N. Teacher chooses random or manual grouping. One shared document per group, every member gets `editor` access, one submission per group. `doc_events.user_id` already records the author of every event: in replay, color-code contributions by member and show a per-member breakdown in the facts panel (inserted characters per member, facts only). Submitting by any member submits for the group. Tests for grouping, access for members, and per-member facts.

Option B: Draggable outline
- Left rail outline built from headings. Dragging a heading moves the whole section (heading plus everything until the next heading of equal or higher level). Keyboard accessible. Tests for the section-move function on fixture documents.

Option C: Markdown export and document labels
- Export current doc to Markdown (download). Labels (tags) on documents with filter chips on the dashboard.

Option D: Small AI helper (only if an API key env var is set; hidden otherwise)
- A teacher-side "Summarize this replay's facts in plain language" button that sends ONLY the computed facts (never the student's text) to the Anthropic API server-side and shows a neutral summary with no judgments. Rate limit it, cap tokens, handle failures quietly. Must not break the app when the key is absent.

Commit as `feat(stretch): <name>` and update AI_LOG.md only with real events.
