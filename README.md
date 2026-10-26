# Z ♥ J

A private, quiet place for Jeffrey and Zul to keep the practical details of their life — work numbers, the home address, the vet, the AC filter size — and a few small shared lists and tasks. Installable on both phones as an app.

**Status: Stage 1 of 3 (responsive shell and core journeys, on clearly labeled demo data).**
Nothing is saved anywhere yet, and nothing in it is real. See [Stage status](#stage-status).

---

## Run it

Normal route (needs the npm registry):

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ with Vite
```

Without npm access (what I used while building; needs `esbuild` and `react` resolvable, e.g. via `NODE_PATH`):

```bash
node scripts/build-local.mjs          # same dist/ layout, hashed assets, CSP <meta> injected
node scripts/preview-local.mjs 4173   # static server with SPA fallback; /api/* is a JSON 404
```

The service worker registers only in production builds, so use `build` + `preview` (not `dev`) to try install and offline behavior. Installing needs `https://` or `localhost`.

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | Strict TypeScript against `@types/react` |
| `npm run typecheck:local` | Same code against a small typed React shim (`tools/react-shim.d.ts`), for machines without `@types/react` |
| `npm test` | 35 unit tests: dates/time zones, recurrence, task completion/undo, work-summary allowlist, search ranking and protected-value exclusion |
| `npm run contrast` | WCAG contrast for every text/control color pairing, read from `src/styles.css` |
| `npm run e2e` | 63 browser checks against a running preview (needs Playwright + Chromium); see `e2e/stage1.cjs` |

Results from the last run are in [`docs/validation-stage1.md`](docs/validation-stage1.md), including what was **not** verified.

## What Stage 1 is

- **Home** — greeting, search, pinned items, shared lists with one-tap add, upcoming tasks.
- **Our Info** — each person's work details and locations (address, phones, fax, scheduling line), credentials (metadata only), home records (address, utilities, internet, maintenance, pet, vehicle), and contacts.
  - **Copy work summary** builds a message from an explicit allowlist of ordinary fields. It cannot include a credential number, because none exist on the client.
  - Fax numbers are copy-only (never a `tel:` link).
  - Protected fields show a lock and a note. The credential page says plainly that secure entry/reveal arrives with sign-in in Stage 2; it has no number field.
- **Lists** — groceries and custom lists: add, check (with Undo), edit, reorder, clear checked, duplicate warning.
- **Plans** — standalone tasks and plans with steps. Recurring tasks either follow a schedule (anchored to the due date) or repeat a set time after you finish. Month ends are handled without drift (Jan 31 → Feb 28 → Mar 31). Completing is idempotent, and Undo takes back the generated next occurrence.
- **Search** — local and deterministic. Understands "my fax", "zul fax", "ac", "vet", "wifi". It only looks at ordinary saved fields; protected values are excluded by construction. The query text is never put in the URL.
- **Honest saving** — every change is applied immediately, then confirmed; if the (simulated) save fails, the screen goes back to the last saved version, shows an alert with **Retry**, and nothing is ever displayed as saved when it wasn't. *Settings → Preview tools → "Make the next save fail"* lets you see this.
- **Offline** — the app opens to a short message ("Connect to view or update your shared information."). The service worker caches only static files; it never touches `/api`, sign-in routes, exports, or household data.
- **Brand** — the Z ♥ J wordmark is a local vector drawing (`src/brand/glyphs.json` → React component, `public/wordmark.svg`, favicon and PNG icons via `npm run icons`). It is an original monoline script design made for this project; replace it by editing `glyphs.json` and re-running `npm run icons`.

## What Stage 1 deliberately is *not*

- **No persistence.** State is in memory; closing the tab resets it. A banner on every screen says so, and Settings has no sign-out or export control because they would do nothing.
- **No sign-in, no server, no database.** Who you are is a switch in Settings (so "my fax" can be tried both ways). The real app gets identity from sign-in only.
- **No real data.** All names, numbers and addresses are placeholders (`555-01xx` phones, `example.com`, all-zero NPIs, "Demo …"). No credential values exist anywhere in the code.
- **No publishing, messaging, email import, banking.** Not touched.
- **RheumDx is not touched and no database is shared with it.**

## Stage status

| Stage | Scope | State |
|---|---|---|
| 1 | Responsive visual shell and core journeys on demo content; wordmark as local vector asset | **Built and verified in Chromium** (see validation report) |
| 2 | Secure sign-in, household-scoped persistence, protected fields, list updates, tasks, conflict handling, export; demo isolated from production | **Not started** |
| 3 | Acceptance verification, defect fixes, working local preview, config names, migrations, final validation report | **Not started** |

### Planned for Stage 2 (names are proposals; none of this exists yet)

- Cloudflare Worker serving this build as static assets plus a same-origin `/api`; the CSP in `scripts/csp.mjs` becomes a real response header (plus `frame-ancestors`).
- Sign-in through Cloudflare Access; the Worker validates the Access JWT on every request (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) and maps two allowed emails to the two members (`MEMBER_EMAILS`). The browser's identity is never trusted.
- D1 database (binding `DB`) with a `household_id` on every row and migrations in `migrations/`.
- Protected fields (DEA and similar) encrypted with AES-GCM using a Worker secret (`PROTECTED_DATA_KEY`), decrypted only on an explicit reveal, never logged, never in search, summaries or exports.
- Versioned writes with `409` conflict responses, 30-day trash, ordinary-data export, quiet refresh polling.
- Demo content isolated behind a build flag so it can never ship to production data.

### What I'll need from you before Stage 2 (nothing has been guessed)

1. The two email addresses each of you will sign in with.
2. A Cloudflare account to host it (and the Access team domain once the Access app exists).
3. Confirmation of the production hostname.
4. A decision on where the encryption key is generated and backed up (I'll give exact steps; I will not generate or store it for you).

## Layout

```
src/
  App.tsx, main.tsx        providers, routes, entry
  pages/                   Home, Info, InfoDetail, Lists, Plans, Search, Settings, NotFound
  components/              Layout (shell, nav, Add menu), FormSheet/Forms, ui, Search, Tasks, QuickAdd, Icon, Wordmark
  data/                    types, demo content (placeholders only), store (optimistic save + rollback + Undo)
  lib/                     dates, recurrence, tasks, search, summary (allowlist), routes, router, pins, pwa, feedback, …
  brand/glyphs.json        single source for the wordmark
public/                    manifest, service worker, offline page, icons, wordmark SVGs
scripts/                   icons, local build + preview, CSP, contrast check
tests/  e2e/               unit tests and browser checks
```

## Notes for whoever maintains this

- Dates are `YYYY-MM-DD` strings with UTC day arithmetic, so daylight-saving changes cannot shift a due date; "today" is computed in `America/New_York` (`HOUSEHOLD_TZ` in `src/lib/dates.ts`).
- No inline scripts or styles are used, so the strict CSP (`default-src 'self'`) holds without exceptions.
- Every control on screen does something useful or is absent; where a feature belongs to a later stage the screen says so in words.
