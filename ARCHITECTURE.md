# Architecture note

## The shape of it

```
Browser (React + TipTap)
   │  REST: JSON + session cookie          ┌─────────────────────────────┐
   ├──────────────────────────────────────▶│ Express                     │
   │                                       │  routes   (validation)      │
   │  SSE: presence + saves                │  services (rules, access)   │──▶ SQLite
   ◀───────────────────────────────────────│  hub      (live channel)    │
                                           └─────────────────────────────┘
          the same process serves the built client
```

One process, one deployable and one database file. For an internal tool on a short timebox, that's the right amount of infrastructure. A split frontend and API would add CORS, cross-site cookies and a second deploy, and reviewers would get nothing for it.

## What I prioritized, and why

**1. Saves you can trust.** Losing someone's work is the worst thing an editor can do, so most of the care went here.
- Autosave is debounced and serialized: one request in flight, with edits merged while it runs.
- Every document has a `version`. A save sends the version it started from, and `UPDATE ... WHERE version = ?` only matches if nobody saved in between. If someone did, the API returns `409` with the latest copy, and the user picks *Use their version* or *Keep mine*.
- The save that runs as a tab closes uses `fetch(..., { keepalive: true })`, so the request survives the page.

**2. Collaboration that's honest about what it is.** Two people can have a document open and see each other: avatars, a pulse while someone is editing, and their saves appearing on the page. This is near-real-time: updates arrive per save, not per keystroke. It runs on server-sent events instead of websockets:
- The traffic is one-way. Writes still go through `PATCH`, where versioning and permissions live, so there's only one write path to secure.
- SSE reuses the session cookie and works through every proxy a free host puts in front of it.
- If you're idle, someone else's save is applied to your page. If you're mid-edit, it isn't, and your next save gets the `409` choice. So "live" never becomes "silently overwritten".

True character-by-character co-editing (CRDT/OT with Yjs) is the next step. It's a different scale of work, and I chose not to start it in the timebox.

**3. Access control in one place.** `DocumentService` works out the caller's role (`owner`, `editor` or `viewer`) in the same query that loads the document. "No access" looks exactly like "doesn't exist", so strangers always get a `404` and can't probe ids. History, the live channel and restore all go through the same check. The UI hides controls the user can't use, but the API is what enforces the rules, and the tests cover the full matrix.

**4. Stored HTML is safe to render.** Documents are kept as HTML, because TipTap, `marked` and `mammoth` all produce it and it keeps formatting exact. Every write passes through an allowlist sanitizer that matches the editor schema: imports, saves and restores take the same path. The home screen's thumbnails render a truncated copy that's re-sanitized, so a cut can't leave a tag open. The CSP blocks inline scripts as a second layer.

## Decisions and tradeoffs

| Decision | Why | Cost |
| --- | --- | --- |
| SQLite with a synchronous driver | No setup, real transactions, `:memory:` per test | One writer, one node |
| Live channel state in memory | Correct and simple for one process | Running several instances would need Redis or Postgres pub/sub behind `DocumentHub`. The class is the seam for that. |
| Versions grouped by author within 5 minutes | History you can actually read, not one entry per keystroke | Finer-grained points inside a session aren't kept |
| HTML instead of ProseMirror JSON | One format for import, storage, preview and export | Harder to diff or merge later |
| Seeded users with a real login | Reviewers can test sharing in seconds. Sessions are real: random token, server-side expiry, httpOnly cookie | No sign-up or password reset |
| Share by email, two roles | Covers the brief and adds the "view only" case that matters for documents | No link sharing or groups |
| A hand-written router (about 40 lines) | Two screens didn't justify a dependency. It also gave me one place to add view transitions | Would swap for a real router as screens grow |
| Self-hosted fonts | No third-party requests, and the CSP stays at `'self'` | About 300 kB of font files, cached after the first visit |

## Design

The visual idea is that collaboration shows up as highlighter ink. Every person gets a highlighter color, derived from their name so every screen agrees without storing anything, and that color follows them: their avatar, their presence ring, their entries in history, the tab on documents they've shared with you, and their cursor in the login scene. Paper is white and crisp, the desk is a blotter blue, and actions are dark ink.

The motion is deliberate. There's one orchestrated moment, the login scene, where a document writes itself while two collaborators highlight and add to it. Everything else answers something the user did: a thumbnail grows into its page (View Transitions API, with the page prefetched so the animation lands on real content), dialogs, the history drawer and toasts animate in, and the save dot breathes while saving. All motion turns off under `prefers-reduced-motion`.

## Validation, errors, operations

- Request bodies are checked with zod at the route layer, and the services enforce their own rules too. Every error has one shape, `{ error: { code, message } }`, with messages written for the person reading them.
- Sign-in is rate limited per IP and email (10 attempts per 15 minutes). The response says when to try again and sets `Retry-After`.
- Security headers come from helmet. The CSP is `'self'` only, with no inline scripts.
- There's one JSON log line per API request, with a request id that's also returned in `X-Request-Id`.
- On shutdown, the server closes its event streams so it can exit cleanly.

## Intentionally left out

- Character-level co-editing and remote cursors (CRDT).
- Comments and suggestion mode.
- Images and tables in documents. The sanitizer drops them, so imported tables come through as text.
- Sign-up, password reset and SSO.
- PDF import.

## With another 2–4 hours

1. **Yjs co-editing over the same channel.** I'd keep the REST save as the persisted snapshot, so versioning and history keep working.
2. **Comments** anchored to text ranges, using the people colors that are already there.
3. **Postgres** behind the same service interfaces, for a free host with persistent storage, plus pub/sub so the live channel can run on more than one instance.
4. **Link sharing** with an expiry, as a third way to grant access.
