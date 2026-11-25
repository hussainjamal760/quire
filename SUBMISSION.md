# Submission

**Candidate:** Aaron Batilo
**Live app (full stack):** https://quire-ilb6.onrender.com
**Browser demo (runs entirely in your browser, no server):** https://claude.ai/artifact/YCwQ4hzAE6CtxvCk1e9v3g. Open it in two tabs and sign in as two different people to try sharing and live edits.
**Video:** in `VIDEO_URL.txt`
**Test accounts:** `alice@ajaia.dev`, `bob@ajaia.dev`, `carol@ajaia.dev`, password `quire-demo` (there are one-click buttons on the login screen)

## What's in this folder

| Path | What it is |
| --- | --- |
| `README.md` | Setup, run, test and deploy instructions, and the feature list |
| `ARCHITECTURE.md` | What I prioritized, tradeoffs, design notes, what's next |
| `AI_WORKFLOW.md` | AI tools used, what I changed or rejected, how I verified it |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Link to the walkthrough video |
| `server/` | Express + SQLite API (TypeScript), with tests in `server/test/` |
| `client/` | React + TipTap frontend (TypeScript) |
| `e2e/` | Playwright browser tests |
| `.github/workflows/ci.yml` | CI: lint, format, types, API tests, browser tests, Docker build |
| `docs/screenshots/` | Every main screen at desktop and mobile width |
| `docs/walkthrough-outline.md` | The outline I followed for the video |
| `Dockerfile`, `render.yaml` | Deployment (Render free tier, or any Docker host) |

`node_modules/`, build output and the database are left out on purpose. `npm install && npm run build && npm start` recreates them.

## Status

**Working end to end**

- Create, rename, edit, autosave, reopen and delete, with rich text (headings, bold, italic, underline, strikethrough, lists, quotes)
- Importing `.txt`, `.md` and `.docx` (click or drag and drop, up to 2 MB); exporting to Markdown and print/PDF
- Sharing by email as Can edit or Can view, plus changing and removing access. Owned and shared documents are listed separately.
- Persistence in SQLite, with formatting kept exactly after a reload
- Presence (who's here, who's editing) and live updates as others save
- Safe concurrent editing: a stale save is refused, and the user chooses whose version to keep
- Version history with preview and restore
- 30 API tests, 6 browser tests and CI

**Stretch items done:** role-based permissions (editor and viewer), version history, export to Markdown and PDF, and real-time collaboration indicators.

**Not built (on purpose):** character-level co-editing (CRDT), comments, images and tables, sign-up and password reset. The reasons are in `ARCHITECTURE.md`.

**Next 2–4 hours:** Yjs co-editing over the existing live channel, comments, Postgres for persistent free hosting and multi-instance pub/sub, and link sharing.

**Known limitation of the free deployment:** Render's free plan has no persistent disk, so data resets to the demo seed on redeploy or after the service spins down from inactivity. The first request after a spin-down can take about 30 seconds.
