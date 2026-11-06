# How to run this pack

1. Create an empty folder, open it in VS Code, start Claude Code in that folder.
2. Copy `CLAUDE.md`, `PLAN.md`, `AI_LOG.md`, `DEPLOY.md` and the `prompts/` folder into the folder root. Claude Code reads `CLAUDE.md` automatically.
3. Paste the contents of `prompts/B0-setup.md` as your first message. While it works, do the steps in `DEPLOY.md` (Neon + GitHub + Vercel).
4. After each block: skim the diff, click through the manual checklist it gives you, check the deployed URL, then paste the next prompt. Do not skip the click-through, it is also your video rehearsal.
5. When Claude Code does something you reject or fix, tell it, and make sure it lands in `AI_LOG.md`. You can also add entries yourself. That file is your best evidence for the AI workflow note.
6. At 15:50, run the gate check in PLAN.md. Cut in the order listed if you are behind.
7. B8 writes the submission documents. Then record the video using `VIDEO_NOTES.md`, put the link in `VIDEO_URL.txt`, add a few screenshots, and upload everything to one Google Drive folder.

Tips
- Use plan mode for B4 and B5 if you want to review its approach before it writes code.
- If a block runs long, ask Claude Code to cut scope inside the block instead of letting it drift. The prompts list the priorities.
- Keep one terminal running `npm run dev` and one browser window per demo user (use a private window for the second user).
