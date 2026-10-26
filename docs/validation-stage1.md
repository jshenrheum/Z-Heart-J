# Stage 1 validation report

Scope: the responsive shell and core journeys on demo data (README → *What Stage 1 is*). Stages 2 and 3 are not started, so nothing about sign-in, persistence, encryption, or export has been validated, because none of it exists yet.

**Environment.** Headless Chromium via Playwright 1.63, Node 22, React 19.2.8, TypeScript 6.0.3, esbuild 0.28.2. The npm registry was unreachable from my workspace, so the app was built with `scripts/build-local.mjs` (esbuild) rather than Vite, and type-checked against a small typed React shim rather than `@types/react`.

## Results

| Check | Result |
|---|---|
| Type check (strict, `noUncheckedIndexedAccess`), `npm run typecheck:local` | Clean |
| Unit tests, `npm test` | **35 / 35** pass |
| Contrast, `npm run contrast` | **30 / 30** pairings pass (text ≥ 4.5:1; field borders and focus rings ≥ 3:1) |
| Browser checks, `npm run e2e` (390 px phone viewport, built bundle with the production CSP) | **63 / 63** pass |
| Every route at 320 px: horizontal overflow, console errors | None. 14 routes + 2 form sheets also have one `h1`, unique ids, and every control named |
| Production bundle | JS 90 KB gzipped, CSS 5 KB gzipped, no console or CSP errors |
| Privacy scan of source and bundle | Only `example.com` addresses, `555-01xx` phones, all-zero NPIs. No credential values exist in the bundle (credentials carry metadata only) |

What the 63 browser checks cover: search (ranking, "my fax", protected fields, empty state, no query in the URL); work-summary copy (allowlist, fax copy-only, tel links); list add, check, edit, reorder, remove, clear-checked and Undo; duplicate warning; new list; failed save → rollback → alert → Retry; alert stays in view when scrolled; offline panel and recovery; recurring tasks (schedule vs after-completion, month-end, Undo with no duplicate); form validation, discard prompt, focus return; "viewing as" switch; pin/unpin; add contact; edit location (summary updates) and home record; manifest; service-worker cache contents (static allowlist only, `/api` never cached); offline cold start; skip link and focus.

## Defects found by this testing and fixed

1. **Undo of a recurring task left two open copies.** Completing generated the next occurrence, but Undo only reopened the original. Occurrences now record where they came from, and reopening takes back an untouched successor (edited or finished ones are kept). Three new unit tests.
2. **Duplicate HTML id in forms.** The dialog heading and the "Task" field shared an id, so screen readers would not have announced the field's label. Field ids are now prefixed.
3. **First Tab skipped the skip link.** The app focused `<main>` on first load. It now does that only on later navigations.
4. **Focus was lost after closing a form** opened from the Add menu. It returns to the Add button.
5. **A task saved without a due date seemed to vanish** because the default Plans view showed dated tasks only. The default is now *All open*; *Upcoming* remains as a filter.
6. **Toast "Undo" button wrapped to "Un / do"**, and the **save-failed alert could be scrolled out of sight**. The button no longer wraps; the alert is sticky under the top bar.
7. **Field borders were 1.3:1** against their background (below the 3:1 non-text minimum). Now 3.7–4.1:1.

Also corrected wording ("6 months after I finish" → "after it's done"), tap targets under 44 px, and a missing `h1` on the not-found page.

## Not verified. Please check these yourself

- **Real-device install and use:** iPhone Safari (Add to Home Screen), Android Chrome (install prompt), and standalone-mode behavior on both. I tested only desktop Chromium emulating a phone viewport, so safe-area padding, the bottom nav against the iOS home indicator, and keyboard overlap on forms are unconfirmed.
- **Screen readers** (VoiceOver, TalkBack). Structure, names, focus, and live regions are checked programmatically only.
- **Safari and Firefox rendering.**
- **The Vite build and `@types/react` type check.** I could not install them. Source is written for both, but `npm install && npm run build` has not been run by me. If it reports anything, send me the output.
- **The "update available" flow** (a new service-worker version replacing an old one) needs two deployed versions.
- **Clipboard on iOS** requires a tap, which every copy button is; the manual-copy fallback dialog exists but is untested on iOS.
- **Directions** opens Google Maps with the address in the link, only when someone taps it.

## Honest limits of the demo

Changes live in memory and reset on reload; the same screens will talk to a server in Stage 2. "Make the next save fail" (Settings) simulates a failed save so the rollback and Retry can be seen.
