# Draftline

A collaborative document editor for learning and teams, built as a take-home for Ajaia (Full Stack Product Engineer). Pitch in one line: **a docs editor where the writing process is visible to everyone, with assignments built in.**

Read PLAN.md before every task. It holds the scope, data model, access rules and time budget. If a request conflicts with PLAN.md, say so before coding.

## Stack (fixed, do not swap)
- Next.js (latest stable, App Router) + TypeScript (strict) + Tailwind
- Postgres on Neon, Drizzle ORM + drizzle-kit migrations
- Tiptap v3 (open-source extensions only, no paid/Pro extensions, no Tiptap Cloud)
- Auth: hand-rolled. bcryptjs for hashes, `jose` for a signed httpOnly session cookie. No third-party auth service.
- zod for every request body and query
- Vitest for tests. Tests run against PGlite (`@electric-sql/pglite`) so no external database is needed
- Deploy target: Vercel (free) + Neon (free). Must work with zero paid services

## Hard constraints
- Vercel functions cap request bodies at 4.5MB. Uploads are capped at 4MB and the cap is stated in the UI and README.
- No live co-editing, no websockets, no long-running servers. Concurrency is handled with an optimistic `version` check (409 on conflict).
- Tiptap in Next: always `immediatelyRender: false`, editor components are `"use client"`.
- Routes using mammoth or Buffers set `export const runtime = "nodejs"`.
- Never write to the local filesystem at runtime (serverless). Files live in Postgres (bytea).
- Reviewers must be able to use the app with zero setup: seeded demo users with one-click sign in on the login page.

## Engineering rules
- ONE function decides document access: `getDocAccess(userId, docId)` in `src/server/access.ts`. Every route and server action goes through it. Never inline permission checks.
- Server is the source of truth for time (`created_at`, event timestamps, late flags). Never trust client clocks for anything that affects grading or the audit trail.
- Validate with zod, return `{ error: { code, message } }` JSON with correct status codes (400, 401, 403, 404, 409, 413, 415). The UI shows friendly messages, never raw errors.
- Keep files small and named by feature (`src/features/<feature>/...`). No giant components.
- Every block of work ships with its own tests. Run `npm run typecheck && npm test` before saying a block is done.
- Commit after each block: `feat(<area>): ...`. Small, honest commits.
- Design: light theme by default with a dark toggle, green accent (emerald family), generous whitespace, a paper-like editor canvas. It should feel calm and intentional, not like a template.
- Copy and docs: plain, natural language. No em dashes anywhere (UI copy, docs, comments).

## AI log (important)
Maintain `AI_LOG.md` at the repo root. Append an entry ONLY when something real happens:
- the human rejects or rewrites your output (what, why),
- you discover a bug in your own earlier output (what, how found),
- a verification step caught something (what was run, what it showed).
Format: `- [block] what happened | decision | how it was verified`. Never invent entries. This file feeds the AI workflow note that reviewers read.

## Commands
`npm run dev`, `npm run build`, `npm run typecheck`, `npm test`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`
