# Validation report — Stages 2 and 3

Scope: secure sign-in, household-scoped persistence, protected fields, lists, tasks, conflicts, trash, export, demo isolation (Stage 2); acceptance verification, defect fixes, local preview, documentation (Stage 3). Stage 1's report is kept in [`validation-stage1.md`](validation-stage1.md).

**Nothing has been deployed.** Everything below ran on one Linux machine against the real Worker code in workerd (Miniflare 5) with a real local D1 (SQLite) database, behind a local stand-in for Cloudflare Access that signs real RS256 tokens.

**Environment.** Node 22.22, npm 10.9, React 19.3, TypeScript 6.0, Vite 7.3, wrangler 4.153 (workerd 2026-10-23), Playwright 1.64 driving Chromium 1243 (the only browser available here).

## Results (26 October 2026)

| Check | Result |
|---|---|
| `npm install && npm run build` — the real Vite build and `@types/react` type check, never run before | Failed at first (below); now clean |
| Type check: app (browser types only), tests and scripts (Node), Worker (Workers types); strict, `noUncheckedIndexedAccess` | Clean |
| Unit tests, `npm test` | **41 / 41** (Stage 1's 35 + 6 for record validation) |
| Worker tests, `npm run test:worker` | **42 / 42** |
| Contrast, `npm run contrast` | **30 / 30** |
| Browser checks on the demo build, `npm run e2e` | **65 / 65** (Stage 1's 63, the Trash page audit, the update prompt) |
| Browser checks on the signed-in app, two phones, `npm run e2e:live` | **19 / 19** |
| Production build check (`scripts/check-dist.mjs`) | No demo content or demo controls, CSP meta, no inline script or style, no source maps |
| `wrangler deploy --dry-run`; `wrangler d1 migrations apply --local` | Bundles (Worker 16 KB gzipped); migration applies (11 statements) |
| `npm audit` | 0 vulnerabilities |
| App bundle | JS 103 KB gzipped, CSS 5 KB |

What the Worker tests cover: sign-in refused without a token, and for tokens signed by another key, for the wrong audience or issuer, expired, not yet valid, with an unknown key id, without an email (service token), `alg: none`, or garbage; emails mapped case-insensitively, strangers refused (403); browser-supplied identity ignored; missing or placeholder settings fail closed (503) with the setting's name; CSP with `frame-ancestors 'none'` and the other headers on pages, assets and API; SPA routes; cross-site writes, non-JSON bodies, unknown routes and wrong methods refused; server-side validation of every kind (unknown fields, formats, `javascript:` URLs, impossible dates, a protected field carrying a value); versioned updates, `409` with the current record, a retried update or create or delete answered rather than refused; owner and task status kept out of ordinary edits; another household's rows invisible and untouchable; trash with cascade, restore, refusal to restore an item without its list, purge after 30 days on read and by the daily schedule (protected values included); completion idempotent, three simultaneous completions making exactly one next occurrence, Undo removing an untouched one and keeping an edited one; clear-checked skipping items changed meanwhile; pins private to each member and capped at six; `304` for an unchanged household; protected values encrypted at rest and absent from state, export, records and audit tables, revealed only on request with the revealer recorded, refused for non-protected slots and bad sizes, deleted with their field, undecryptable when moved onto another record, refused without a key, and reported as a key mismatch under a different key.

What the two-phone browser checks cover: redirect to sign-in without a session; each phone is who it signed in as; no demo banner, "viewing as" switch or simulated failure in the production build; first-run empty states; a list item surviving reload; the other phone receiving it through the quiet refresh without reloading; a failed save rolling back with an honest alert and Retry saving it exactly once; a stale edit refused with the newer version kept and the user's text still in the form, saved on an explicit second save; a credential number saved, hidden until Reveal, revealable by the other member with "Saved by Jeffrey", and absent from search, the work summary, the shared data and the downloaded export; a recurring task completed and undone; trash and restore across both phones; offline message and recovery; service-worker cache holding only static files; an expired session saving nothing and asking to sign in again; sign-out.

## Defects found and fixed

In the handoff:

1. **The real build failed.** The unit tests import `node:test` and `node:assert`, but the type check had no Node types. The app is now checked with browser types only and the tests with Node types.
2. **The update prompt could never appear.** `sw.js` was identical in every build, so browsers never saw a new worker after a deploy and a long-open app kept old code. Each build now names the cache from its own files; a browser check simulates the next deploy and sees the prompt, the switch-over and the old cache removed.
3. **Work details showed empty rows with Copy buttons that copied nothing** when a field was blank (invisible with demo data). Empty rows are hidden; the page says what to add.
4. **"Groceries" was found by a fixed demo id**, so a real Groceries list wouldn't sort first or appear in the Add menu. It's found by its title.
5. `npm audit`: a high-severity advisory in `sharp` (used only to draw the icons). Upgraded; the icons are byte-identical.

In my own Stage 2 code, caught by tests or review before this report: the first write to a new household failed until the app had loaded once (household now created on any request); a retried delete was reported as a failure; pins to deleted records still counted toward the six-pin limit, invisibly; search results for two fields with the same label shared an id; the credential card said "Number protected" when no number was saved.

## Not verified — please check these yourself

- **A real Cloudflare deployment**: Access login with your identity provider, the token the real Access sends, D1 in the cloud, the daily purge schedule, the custom domain. All were exercised only through the local stand-ins described above.
- **Real phones**: installing and using on iPhone Safari and Android Chrome, standalone mode, safe-area padding, the bottom nav against the iOS home indicator, the keyboard over forms, and the Access sign-in inside the installed app.
- **Screen readers** (VoiceOver, TalkBack): structure, names, focus and live regions are checked programmatically only.
- **Safari and Firefox rendering**: only Chromium was available.
- **Clipboard on iOS**: every copy is a tap; the manual-copy fallback is untested on iOS.

## Honest limits

- Two members, one household. Separate private spaces would need real per-person permissions on the server.
- A protected value is readable by whoever can sign in as either member — that's the point — and by anyone holding both the database and the key. The key is yours to generate and keep (README → Deploy).
- Exports are JSON (ordinary data only). There is no import.
- Changes from the other phone arrive within about 15 seconds while the app is open, not instantly.
