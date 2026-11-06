Read CLAUDE.md and PLAN.md. Task B7: hardening. Budget: 10 minutes.

1. Run the full suite and the production build. Fix anything failing.
2. Security and validation sweep: confirm every route calls getSessionUser and getDocAccess, every body goes through zod, no route returns data the user should not see, uploads are validated by extension, mime and size, responses to inaccessible resources are 404 (not 403) where revealing existence would leak information. List anything you changed.
3. Error and empty states: every list has an empty state, every mutation has a visible error state, the 404 and error pages look intentional.
4. Seed polish so a reviewer lands on a demo that tells the story immediately (idempotent):
   - Ms. Rivera has a class "Period 3 English" with Ana, Ben, Cam, Dee.
   - One assignment "Personal essay" due in 3 days with real instructions and a template.
   - Ana's copy has a realistic recorded history (typed paragraphs, one paste event, an edit) so Replay is meaningful on first click.
   - Ben has not started. Cam has submitted on time. Dee has a late submission (seed an assignment with a past due date, "Reading response", to show the Late badge).
   - A shared document: Ms. Rivera's "Class syllabus" shared with Ana as viewer and Ben as editor, plus a pending invite to `newstudent@demo.test` (signing up with that email shows the doc in Shared with me).
   Generate the seeded events through the same recorder/server code paths so replay fidelity is real, not faked JSON.
5. Accessibility basics: focus states, labelled controls, keyboard operable dialogs, sufficient contrast in both themes.
6. Report the test count and coverage areas, and any known gaps you are aware of (I will list them honestly in the README).

Commit as `chore: hardening, seed story, a11y`.
