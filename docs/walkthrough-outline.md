# Walkthrough outline (about 4½ minutes)

My own notes for recording. Not one of the deliverables. Before recording, put Alice in a normal window and Bob in a private window, side by side.

1. **Intro (20s).** Quire is a small document editor for teams. I put depth into one thing: you can trust it with your work, even with other people in the document.
2. **Login and home (30s).** Let the login scene play. Sign in as Alice. The thumbnails are real renders of each document. Point out "Your documents" and "Shared with you", and the colored tab showing who shared a document and your access.
3. **Writing (45s).** New document, rename it, a heading, bold, a list, underline. "Editing → Saving → Saved". Reload, and everything is back.
4. **Import and export (25s).** Drag a `.docx` or `.md` onto the home screen and it becomes a document. Then use the menu to download it as Markdown.
5. **Sharing and live edits (60s).** Open the launch plan in both windows. Bob's avatar appears for Alice. Bob types, and it lands on Alice's page with his pulse. Show Carol as view-only: there's no toolbar, but she sees changes live. Then share and remove access, and Bob gets bounced out.
6. **Conflict and history (40s).** Type in both windows at once to get the "Use their version / Keep mine" choice. Open history, preview an older version, restore it, and show that the replaced version is still there.
7. **Decisions and cuts (40s).** One process with SQLite and SSE. Versioned saves rather than CRDT, and why. Access checked in one query, so strangers get a 404. Sanitizing on every write. Cut: character-level co-editing, comments.
8. **AI and verification (30s).** Where Claude sped things up, and the role-leak bug I caught from a screenshot. Tests: 30 API, 6 browser, all in CI.
