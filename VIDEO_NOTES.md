# Video talk track

Target length: 4 minutes. Record at 1080p, screen + audio only. No slides needed.

---

## 0:00 - Pitch (30 seconds)

**What to show on screen:** The login page with the demo buttons visible.

**Say:**
"Draftline is a collaborative document editor where the writing process is visible to everyone. The core idea is that a teacher should be able to see not just what a student wrote, but how they wrote it - the order, the revisions, what was pasted in. I built this in a day as a take-home for Ajaia."

"Let me sign in as Ms. Rivera, the teacher in the demo."

**Action:** Click "Sign in as Ms. Rivera (teacher)". You land on the dashboard.

---

## 0:30 - Create, format, autosave, rename (30 seconds)

**What to show on screen:** The document dashboard, then the editor.

**Say:**
"The dashboard shows your documents and what's been shared with you. Let me create a quick document to show the editor."

**Actions:**
1. Click "New document". A blank document opens.
2. Type a title: "Quick test"
3. Type a line of body text
4. Use the toolbar: make a word bold, add a heading, change font size
5. Watch the "Saved" indicator appear in the header (autosave fires after 2 seconds of idle)
6. Click the title in the header to rename it inline

**Say:**
"Autosave fires 2 seconds after you stop typing. The version counter on the server uses optimistic locking - if two people edit simultaneously, the second save gets a 409 and the UI tells you to reload."

---

## 1:00 - Import .docx (25 seconds)

**What to show on screen:** The dashboard, then the Import flow.

**Say:**
"You can import a Word document. It converts to rich text using mammoth. Images are extracted and stored as attachments, not inlined."

**Actions:**
1. Navigate back to the dashboard
2. Click "Import"
3. Pick a small .docx file (prepare one ahead of time)
4. The imported document opens in the editor

**Say:**
"Complex table formatting and footnotes are dropped - I note that in the README. Simple prose converts well."

---

## 1:25 - Share with a second user and pending invite (35 seconds)

**What to show on screen:** The Class Syllabus document, then the Share dialog.

**Say:**
"Let me open the syllabus I shared ahead of time."

**Actions:**
1. Navigate to the dashboard, open "Class syllabus"
2. Click Share in the header
3. The dialog shows Ana (viewer), Ben (editor), and newstudent@demo.test with a Pending badge
4. Change Ben's role to Viewer using the dropdown
5. Type a new email and invite at Commenter role

**Say:**
"Pending invites activate when that email signs up or logs in. Until then the share row exists but grants nothing. Roles are enforced server-side through a single access function - I never inline permission checks."

---

## 2:00 - Replay and facts (50 seconds)

**What to show on screen:** Ana's personal essay, then the Replay page.

**Say:**
"The interesting part is replay. Let me open Ana's personal essay."

**Actions:**
1. Go to Assignments, click into "Personal essay"
2. Click "Open" on Ana's row (or navigate to the document directly as Ms. Rivera)
3. Click Replay in the header

**Say:**
"Every transaction in Tiptap is recorded as ProseMirror steps. The replay re-applies those steps from a checkpoint, so you are watching the exact edit sequence, not an approximation."

**Actions:**
4. Click Play and let it run for a few seconds
5. Pause. Point out the paste marker on the scrub bar
6. Click the paste marker to jump to it
7. Point to the facts panel

**Say:**
"The facts panel shows active writing time - gaps over 2 minutes count as idle - the number of sessions, and what fraction of content was typed versus pasted versus imported. No suspicion labels. Just the numbers."

8. If Ana's events are from two sessions, point to the session count
9. Point to the per-author panel (only relevant on shared docs, but mention it)

**Say:**
"On shared documents you get per-author attribution. Each author gets a stable color and their own breakdown."

---

## 2:50 - Assignment dashboard (30 seconds)

**What to show on screen:** The Assignments page, then the teacher dashboard for "Personal essay".

**Say:**
"Back to assignments."

**Actions:**
1. Go to Assignments
2. Click into "Personal essay"
3. The teacher sees a table: Ana (Submitted), Cam (Submitted), Dee (Submitted, Late badge), Ben (Not started)

**Say:**
"Late is computed server-side from the due date. The student's client clock is never trusted for anything that affects the audit trail."

4. Click Replay on Ana's row to show it navigates to replay

---

## 3:20 - What I cut and why (20 seconds)

**What to show on screen:** You can stay on the same screen or return to the dashboard.

**Say:**
"Three things I cut: comment threads - the schema and commenter role are defined, no API routes yet. Dark mode - CSS variables and a dark theme block are written, no toggle in the UI. Export - import was the higher-value direction since detecting a paste from Word is the whole point."

---

## 3:40 - How AI helped and what I rejected (20 seconds)

**What to show on screen:** You can close the app or stay on dashboard.

**Say:**
"I used Claude throughout. It was fastest on schema and test boilerplate. It made real mistakes: the autosave implementation had a closure bug that caused false conflict banners - I caught that in testing and fixed the save loop to use refs. The seed script used a ProseMirror API that does not exist - typecheck caught it. Those are both in the AI log."

---

## 4:00 - Close

**Say:**
"The full editing history, the access model, and the assignment workflow are built and deployed. The obvious next step is comment threads - the schema is already there, it is a few API routes and a floating UI away. Thanks for watching."

---

## Accounts and prep checklist before recording

- [ ] Verify live URL is working
- [ ] Confirm seed ran: sign in as rivera@demo.test, see Class Syllabus and assignments
- [ ] Prepare a small .docx file for the import demo (1-2 pages of plain prose)
- [ ] Have the Assignments page loaded for quick navigation
- [ ] Set browser zoom to 100%, hide bookmarks bar
- [ ] Close unrelated tabs
- [ ] Test audio levels before recording
