# Deploy checklist (you do this by hand while Claude Code builds B0)

Takes about 8 minutes. Do it first so every block can be verified on the live URL.

1. Create a GitHub repo (private is fine) and push the scaffold after B0 finishes.
2. Neon: create a free project at neon.tech. Copy the pooled connection string (it ends with `?sslmode=require`).
3. Vercel: Import the GitHub repo. Framework preset: Next.js.
4. Environment variables in Vercel (Production and Preview):
   - `DATABASE_URL` = the Neon connection string
   - `SESSION_SECRET` = output of `openssl rand -base64 32`
5. First deploy. Then run migrations and the seed against Neon from your machine:
   - put the same `DATABASE_URL` in `.env.local`
   - `npm run db:migrate && npm run db:seed`
6. Open the Vercel URL and sign in with a demo user.
7. For reviewers: Vercel project Settings > Deployment Protection > turn OFF protection for production so the link opens without a Vercel login. Test the URL in a private window.

Notes
- Neon free databases scale to zero, so the first request after idle can take a second or two. Hit the site once before you record the video or send the link.
- Seeds must be idempotent so you can re-run them safely before submitting.
- Add `/api/health` that runs `select 1`. Use it to confirm the DB connection after deploys.
