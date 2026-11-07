# Draftline

A collaborative document editor where the writing process is visible to everyone. Teachers assign documents, students write, and the full editing history is replayable with per-author attribution.

**Live URL:** https://draftline.vercel.app *(placeholder - update before submission)*

---

## Demo accounts

All accounts use the password `demo1234`. One-click sign-in buttons are on the login page.

| Email | Name | Role |
|---|---|---|
| rivera@demo.test | Ms. Rivera | Teacher |
| ana@demo.test | Ana | Student |
| ben@demo.test | Ben | Student |
| cam@demo.test | Cam | Student |
| dee@demo.test | Dee | Student |

---

## 60-second reviewer tour

This is the fastest path through the core features, starting as Ms. Rivera.

1. **Sign in** - go to `/login`, click "Sign in as Ms. Rivera". You land on the doc dashboard.
2. **Sharing** - open "Class syllabus". Click Share in the header. You will see Ana (viewer), Ben (editor), and a pending invite for newstudent@demo.test. Change a role and hit Remove to test revocation.
3. **Import** - from the dashboard, click Import and pick any .docx or .md file (under 4MB). It opens as a new document with the content converted.
4. **Replay** - open "Personal essay (Ana)" from the dashboard or from the Assignments page. Click Replay in the header. Use the scrub bar or Play button to watch Ana's edits unfold. The facts panel shows sessions, active writing time, and paste events. The per-author panel shows attribution breakdown.
5. **Assignments** - go to Assignments. Ms. Rivera sees all three assignments with the student submission table. Click into "Personal essay" to see Ana's submitted work, Cam's submission, Ben's not-started status, and Dee's late badge. Click Replay on any row to replay that student's document.

---

## Local setup

**Requirements:** Node 18 or 20. A Neon Postgres database. A 32-byte session secret.

```bash
git clone <repo>
cd draftline
cp .env.example .env.local
# edit .env.local: set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate   # applies drizzle/0000_init.sql to your Neon database
npm run db:seed      # idempotent - safe to run multiple times
npm run dev          # http://localhost:3000
```

Generate a session secret:

```bash
openssl rand -base64 32
```

**Environment variables:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (ends with `?sslmode=require`) |
| `SESSION_SECRET` | Random 32-byte base64 string for signing session cookies |

**Run tests** (uses in-memory PGlite, no external database needed):

```bash
npm test
npm run typecheck
```

---

## Supported upload types and limits

**Import (creates a new document):** `.docx`, `.md`, `.txt`. Max 4MB.

**Attachments (added to an existing document):** `.png`, `.jpg`, `.gif`, `.webp`, `.pdf`, `.docx`, `.txt`, `.md`, `.csv`. Max 4MB.

Files are stored as `bytea` in Postgres. No S3 or external storage.

---

## Known docx conversion limits

Draftline uses [mammoth](https://github.com/mwilliamson/mammoth.js) to convert .docx files.

- Complex table formatting (merged cells, nested tables) is flattened or dropped.
- Footnotes and endnotes are not converted.
- Custom fonts are not preserved; the editor uses its own font stack.
- Embedded charts and SmartArt are dropped silently.
- Images are extracted and stored as attachments, not inline in the editor.

Simple prose documents convert well. Documents heavy on Word-specific formatting may look different after import.

---

## Tech stack

- **Framework:** Next.js 15 (App Router), TypeScript strict
- **Editor:** Tiptap v3 with ProseMirror (open-source extensions only)
- **Database:** Postgres on Neon, Drizzle ORM
- **Auth:** Hand-rolled - bcryptjs password hashing, jose HS256 session cookies
- **Validation:** zod on every request body and query
- **Tests:** Vitest with PGlite (in-memory Postgres, no external DB needed)
- **Deploy:** Vercel (serverless) + Neon (serverless Postgres), both free tier
