Read CLAUDE.md and PLAN.md fully before doing anything.

Task B0: scaffold the project and get a login working. Budget: 10 minutes. Be fast, do not gold-plate.

1. Create the Next.js app in the current directory (App Router, TypeScript strict, Tailwind, src/ dir, ESLint). Add scripts: typecheck, test, db:generate, db:migrate, db:seed.
2. Install: drizzle-orm, drizzle-kit, @neondatabase/serverless, bcryptjs, jose, zod, vitest, @electric-sql/pglite. Pick the Drizzle driver that works on Vercel serverless with Neon. If you need transactions, use the Neon serverless Pool driver, otherwise neon-http is fine. Explain your pick in one sentence.
3. Write the full Drizzle schema from the Data model section of PLAN.md (all tables, enums, indexes, the unique constraints listed). Generate and apply the first migration.
4. A db helper that uses Neon in dev and prod, and an in-memory PGlite instance when `NODE_ENV === "test"` (so tests need no external DB).
5. Auth: `src/server/auth.ts` with signup, login, logout, `getSessionUser()`. Session is a signed httpOnly, sameSite=lax, secure-in-prod cookie via jose (7 day expiry). Passwords hashed with bcryptjs. On signup and login, activate any pending `document_shares` and `class_members` rows whose email matches the user (write this as a function `activatePendingForUser(user)`; B2 and B5 will test it).
6. Idempotent seed script: the 5 demo users from PLAN.md (password `demo1234`). Re-running must not duplicate anything.
7. Pages: `/login` (email, password, plus one-click "Sign in as" buttons for each demo user, clearly labelled as demo accounts), `/signup` (with role select), `/` redirects to `/docs` when signed in. A minimal `/docs` page that just shows "Hello, <name>" and a sign out button.
8. `/api/health` that runs `select 1`.
9. A first Vitest test: signup then login works, wrong password is rejected, duplicate email is rejected.
10. `.env.example` with DATABASE_URL and SESSION_SECRET. A `.gitignore` that excludes `.env*` except the example.

Visual direction: calm and intentional. Light background, emerald accent, a clean sans font, generous spacing. Set up CSS variables for colors now so dark mode in B6 is trivial. No em dashes in any copy.

When done: run `npm run typecheck && npm test && npm run build`, commit as `feat(setup): scaffold, schema, auth, seed`, and tell me exactly what to run to migrate and seed against Neon.
