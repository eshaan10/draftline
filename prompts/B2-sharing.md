Read CLAUDE.md and PLAN.md. Task B2: sharing. Budget: 20 minutes.

1. Extend `getDocAccess` in `src/server/access.ts` per the Access rules in PLAN.md (owner, active share role, null). The teacher-of-assignment rule is added in B5, leave a clearly marked extension point.
2. API:
   - `POST /api/docs/:id/shares` body `{ email, role: "viewer"|"commenter"|"editor" }`, owner only. If a user with that email exists, create an active share. If not, create a pending share (status `pending`, `user_id` null). Re-sharing updates the role. Sharing with yourself or with an invalid email returns 400.
   - `GET /api/docs/:id/shares` (owner only) lists people with role and status.
   - `PATCH` to change a role, `DELETE` to revoke (owner only).
   - `GET /api/docs` now returns owned docs and shared docs (active shares) with an `access` field and the owner's name for shared ones.
3. Enforce roles everywhere: viewers and commenters cannot `PUT` content (403), editors can edit and rename but cannot delete or manage sharing, only the owner can delete or share.
4. UI:
   - A Share dialog on the editor page: email input, role select, "Invite" button, list of people with role dropdown, a "Pending" badge for invites who have not signed up yet, and a remove button. Friendly errors.
   - Dashboard: "Shared with me" section populated, with "Shared by <name>" and a role badge (Viewer, Commenter, Editor). Owned docs show "Owned".
   - In the editor, a read-only state for viewers and commenters (toolbar disabled, a "View only" chip), and the access role shown in the header.
5. Confirm `activatePendingForUser` (from B0) turns pending shares into active ones on signup AND login, and the doc appears in their "Shared with me".
6. Tests (this is the most important test file in the project, be thorough): an access matrix test covering owner, editor, commenter, viewer, pending invitee, revoked user, and a stranger, against GET, PUT, rename, delete and share endpoints. Plus pending invite activation on signup, role change, and revoke.

Commit as `feat(sharing): roles, pending invites, shared dashboard`. Then give me a 6-step manual demo script to show the sharing flow with two demo users in two browser windows.
