# AI workflow note

## Tools

- **Claude (Anthropic), used as an agent with a shell.** I used it to scaffold code, write first drafts of most files, run the tests and drive a headless browser for screenshots and end-to-end checks.
- No other AI tools. Library APIs (TipTap 3, zod, helmet, Playwright) were checked against their docs whenever a detail mattered.

## Where it actually saved time

- **Boilerplate:** Express wiring, zod schemas, multer, the fetch wrapper, Dockerfile, CI workflow, ESLint config and most of the CSS. This is where most of the speedup came from.
- **Test scaffolding.** I described the permission matrix (owner, editor, viewer and stranger, for read, write, share, delete and history), and it drafted the Supertest cases. I tightened the assertions.
- **Browser tests.** It drafted the Playwright flows with two signed-in users at once. Writing those by hand would have been slow.
- **Screenshot review.** Rendering every screen at desktop and mobile widths after each change turned up the bugs below faster than clicking around would have.

## What I changed or rejected

- **A data leak in the live broadcast, caught in a screenshot.** The first live-update version broadcast the saver's full document view, including their role. In a screenshot of Alice's page after Bob saved, Alice had lost her Share button and was told the document had been "shared with you", because her copy had picked up Bob's `editor` role. The fix has two sides: the server broadcasts only content fields (a `LiveDocument` type), and the client merges those into its own copy. A unit test now asserts that no `role` is broadcast.
- **Malformed ids returned `400`.** Documents a user can't access already returned `404`, but malformed ids got a `400` from zod, which treated them differently from ids that don't exist. I made them `404` as well, so the two cases can't be told apart.
- **A test that passed for the wrong reason.** A sharing test asserted that Bob's "Shared with you" list contained *only* the new document. It failed because the seed data also shares one with Bob. I changed the assertion to "contains" instead of deleting the seed share to make the test pass.
- **A flaky way to test conflicts.** The obvious way to test two simultaneous saves is to type fast in two windows and hope. Instead, the e2e test holds Alice's save in the network (`page.route`) until Bob's save has landed, which forces the race every time. The suite passed three runs in a row.
- **Dependencies I didn't take.** The suggested stack included a router package. Its latest major version was newer than anything I could check against, and the app has two screens, so I wrote a small router and later added view transitions to it. I pinned TypeScript to 5.9 instead of the newest major, and self-hosted the fonts instead of using Google Fonts, which let the CSP stay at `'self'`.
- **The login animation's cursors were positioned by hand.** That broke as soon as the font changed, and a `clip-path` on the "typing" lines was clipping the name flags. I moved the cursors inline with the text and the clip onto a wrapper.
- **`alert()` and `confirm()`.** I replaced them with an inline confirmation dialog and toasts that match the rest of the UI.
- **Console noise.** `GET /api/auth/me` returned `401` when signed out, which put a red error in the console on every visit to the login page. Being signed out is a normal answer, so it now returns `200 { user: null }`.
- **Bundle size.** I lazy-loaded the editor route so ProseMirror doesn't ship with the login screen. The initial JS dropped from 640 kB to about 240 kB.

## How I verified it

- **Correctness:** 30 API tests against in-memory SQLite. The version-grouping logic takes an injected clock, so the five-minute window is tested without waiting. Strict TypeScript and ESLint cover both packages.
- **End to end:** 6 Playwright tests against the production build in Chrome. They cover formatting surviving a reload, a viewer being read-only while seeing live edits, access removal closing the document, a forced conflict, Markdown import, and restore plus Markdown download. They also fail on any uncaught page error.
- **UX:** I reviewed screenshots of every screen at 1440 px and 390 px after each round of changes, and fixed what they showed: the role leak, the clipped cursor flags, headline line breaks, a status label that overlapped the thumbnail text, and the toolbar wrapping on mobile.
- **Production path:** I built the app, pruned dev dependencies, started it the way the Docker image does, and checked the health endpoint, the SPA fallback, the `Secure` cookie and the CSP header. CI also builds the Docker image.

Overall, the AI drafted a lot. The product decisions, the security choices, the save, conflict and live-update design, and what got cut were mine, and each was checked by running something rather than by reading it.
