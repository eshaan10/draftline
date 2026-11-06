Read CLAUDE.md and PLAN.md. Task B3: file upload, images and attachments. Budget: 20 minutes.

1. Import to a new document (the required upload feature):
   - Dashboard button "Import file" with helper text: "Supports .docx, .md and .txt, up to 4MB." Also accept drag and drop onto the dashboard.
   - `POST /api/import` (multipart, `runtime = "nodejs"`): validate extension, mime and size (415 for unsupported type, 413 for over 4MB, 400 for empty). Title comes from the filename without the extension.
   - .docx: mammoth to HTML with a style map that keeps underline (`u => u`), images intercepted via `convertImage` and stored as attachments (kind `image`) with the editor content pointing at `/api/files/:id`, never base64. Then HTML to Tiptap JSON using the Tiptap server-side HTML utility (use whatever works in a serverless runtime, verify it). Sanitize.
   - .md: convert to HTML (marked or similar) then to Tiptap JSON. .txt: paragraphs split on blank lines, single newlines become hard breaks.
   - After import, open the new document. Record the import as a single `doc_events` row of kind `import` with a seq 0 checkpoint of the initial content (the replay in B4 depends on this).
   - Show import warnings from mammoth in a dismissible notice ("Some formatting may differ from the original").
2. Images in the editor: toolbar image button and paste/drop of image files. `POST /api/docs/:id/attachments` stores bytes in Postgres (kind `image`), returns the URL, and the editor inserts it. `allowBase64: false`. Editor access required.
3. Attachments panel on the editor page: upload any of png, jpg, gif, webp, pdf, docx, txt, md, csv up to 4MB, list files with name, size, who uploaded, download and delete (uploader or owner).
4. `GET /api/files/:id` serves bytes with the right `Content-Type`, `Content-Disposition`, and `X-Content-Type-Options: nosniff`, only if the user has at least viewer access to the owning document (use getDocAccess). Images may be inline, other files as attachment.
5. Fixtures and tests: create tiny fixtures in `tests/fixtures` (generate the .docx programmatically in the test setup, with a heading, bold text, a list, a table, and an image). Tests: each supported type imports with structure preserved, unsupported type returns 415, oversize returns 413, empty returns 400, file download enforces access (stranger gets 404, viewer can read).

Commit as `feat(upload): import docx md txt, images, attachments`. List any docx features that do NOT convert well so I can put them in the README honestly.
