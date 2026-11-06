Read CLAUDE.md and PLAN.md. Task B6: the "better than Google Docs" features. Budget: 10 minutes. Build only these, in this order, stopping when time runs out:

1. Dark mode: theme toggle in the header (system default, light, dark), persisted. Because users complained that existing extensions render dark Docs badly, make sure the editor canvas, toolbar, tables, code blocks, comments panel, replay player and dialogs all look right in dark mode. Keep the emerald accent. No flash of the wrong theme on load.
2. Read aloud: a button in the editor toolbar using the browser SpeechSynthesis API. Reads the selection if there is one, otherwise the whole document. Play, pause, stop, speed selector. Hide the button gracefully if the API is unavailable.
3. Writing goals panel (collapsible, in a side panel or footer): optional word goal with a progress bar, word count, character count, estimated reading time, and Flesch-Kincaid grade level computed locally (write a small tested pure function). Persist the goal per document in local storage.

Tests: unit tests for the word count, reading time and Flesch-Kincaid functions with fixed inputs, including empty text.

Commit as `feat(ux): dark mode, read aloud, writing goals`. If any item takes more than 4 minutes, stop and move on to the next one.
