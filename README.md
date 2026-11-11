# Draftline

A document editor with an append-only editing history. Teachers assign documents, students write, and every edit is replayable with per-author attribution.

**Live URL:** https://draftline-rouge.vercel.app
**Repo:** https://github.com/eshaan10/draftline

---

## Demo accounts

One-click sign-in buttons for all accounts are on the login page. Password for all: `demo1234`.

| Email | Name | Role |
|---|---|---|
| rivera@demo.test | Ms. Rivera | Teacher |
| ana@demo.test | Ana | Student |
| ben@demo.test | Ben | Student |
| cam@demo.test | Cam | Student |
| dee@demo.test | Dee | Student |

---

## 60-second reviewer tour

1. **Sign in as Rivera.** From the dashboard, open "Class syllabus" and click Share to see Ana (viewer), Ben (editor), and a pending invite.
2. **Go to Assignments.** Open "Personal essay" to see the teacher dashboard: Ana submitted on time, Dee submitted late, Ben has not started.
3. **Click Replay** next to Ana's row. Watch her editing history. The facts panel shows active writing time, sessions, and paste events.
4. **Leave feedback.** Click "Add feedback" next to Ana, type a note, save.
5. **Sign in as Ana.** Open Assignments and open "Personal essay". The document is shown in split view with instructions on the left. Teacher feedback appears below.
6. **Back to the dashboard.** Open any document. Try the Writing goals panel (bottom of editor), dark mode toggle (header), and read-aloud button (toolbar).

---

## Local setup

**Requirements:** Node 18 or 20. A Postgres database (free Neon account or local Postgres, no paid services required).

```bash
git clone https://github.com/eshaan10/draftline
cd draftline
cp .env.example .env.local
# edit .env.local: set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3000
```

Generate a session secret:

```bash
openssl rand -base64 32
```

**Environment variables:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (ends with `?sslmode=require`) or a local Postgres URL |
| `SESSION_SECRET` | Random 32-byte base64 string for signing session cookies |

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Next.js development server on port 3000 |
| `npm run build` | Build for production |
| `npm run typecheck` | Run TypeScript strict check with no emit |
| `npm test` | Run all 84 tests with Vitest against PGlite (no database needed) |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |
| `npm run db:migrate` | Apply pending migrations to the database |
| `npm run db:seed` | Seed the demo users and story data (idempotent, safe to re-run) |

---

## Tests

84 tests across 10 files. All use PGlite (in-memory Postgres in WASM), no external database needed.

```bash
npm test
npm run typecheck
```

---

## Upload types and limits

**Import (creates a new document):** `.docx`, `.md`, `.txt`. Max 4 MB. Stated in the UI next to the import button. Drag a file anywhere on the dashboard page to import it.

**Attachments (added to an existing document):** `.png`, `.jpg`, `.gif`, `.webp`, `.pdf`, `.docx`, `.txt`, `.md`, `.csv`. Max 4 MB.

The 4 MB limit comes from Vercel's 4.5 MB function body cap. Files are stored as `bytea` in Postgres. No S3 or external storage.

**docx conversion limits (via mammoth):** complex table formatting, footnotes, endnotes, charts, and SmartArt are not converted. Images are extracted and stored as attachments. Simple prose documents convert cleanly.

---

## Deploy

The app deploys to Vercel with no configuration file required (Next.js is auto-detected). Set `DATABASE_URL` and `SESSION_SECRET` as environment variables in the Vercel dashboard.

After deploying, run:

```bash
npm run db:migrate   # apply the schema to the production database
npm run db:seed      # seed demo accounts (safe to run multiple times)
```

---

## Tech stack

- **Framework:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS
- **Editor:** Tiptap v3 on ProseMirror, open-source extensions only
- **Database:** Postgres on Neon, Drizzle ORM
- **Auth:** Hand-rolled - bcryptjs password hashing, jose HS256 session cookies
- **Validation:** zod on every request body and query
- **Tests:** Vitest with PGlite (in-memory Postgres, no external DB needed)
- **Deploy:** Vercel + Neon, both free tier
