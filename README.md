# Z ♥ J

A private, quiet place for Jeffrey and Zul to keep the practical details of their life — work numbers, the home address, the vet, the AC filter size — and a few small shared lists and tasks. Installable on both phones as an app.

**Status: live at https://z-heart-j.jshenrheum.workers.dev** (deployed 26 October 2026, behind its own Cloudflare Access application). Every push to `main` deploys. Test results and what is still unverified: [`docs/validation.md`](docs/validation.md).

---

## Try it

```bash
npm install
npx playwright install chromium     # once, for the browser checks

# The signed-in app on your computer: the real Worker and a local database, behind a
# local stand-in for Cloudflare Access where you pick Jeffrey or Zul.
npm run build && npm run preview:local          # http://127.0.0.1:8788

# The demo: placeholder content in memory, no server, a "viewing as" switch.
npm run build:demo && npm run preview:demo      # http://127.0.0.1:4173
npm run dev                                     # the demo with hot reload (http://localhost:5173)
```

The local preview keeps everything (database and a throwaway encryption key) in memory; stopping it erases it. Installing as an app needs `https://` or `localhost`.

## Checks

| Command | What it checks |
|---|---|
| `npm run typecheck` | Strict TypeScript: the app (browser types only), tests and scripts (Node types), the Worker (Workers types) |
| `npm test` | 56 unit tests: dates and time zone, recurrence, completion and undo, work-summary allowlist, search ranking and protected-value exclusion, record validation, calendar repeats and agenda, list suggestions |
| `npm run test:worker` | 46 tests of the real Worker in workerd with a real local D1: sign-in (forged, expired, wrong audience, not a member), setup errors, headers, validation, 409 conflicts, trash and purge, task completion races, encryption, export, household scoping, calendar events, and migration 0002 on a filled database |
| `npm run contrast` | WCAG contrast for every text and control colour pairing (52) |
| `npm run e2e` | 79 browser checks on the demo build (serve it with `npm run preview:demo` first) |
| `npm run e2e:live` | 20 browser checks on the production build behind the local Worker, with two phones (Jeffrey and Zul) |
| `npm run build` | Also refuses a production build containing any demo content or demo control, inline script or style, or source maps (`scripts/check-dist.mjs`) |

If your installed Chromium differs from the one Playwright expects, set `CHROMIUM_PATH` for the two browser suites.

## What it does

- **Home** — the wedding countdown, this week on the calendar, tasks coming up; Pinned and Shared lists fold away until opened (search is in the header).
- **Calendar** — one shared calendar. Each event is Jeffrey's, Zul's or both (champagne, rose, white), with a filter for Everyone, Mine or the other's. A month grid with dots and an agenda. Events have times or are all day (and can span days), a place with Directions, notes, and repeats (daily, weekly, monthly, yearly; month ends don't drift); one day of a repeat can be removed on its own. Dated tasks, plan target dates and credential expiry dates appear on it automatically.
- **Our Info** — each person's work details and locations (address, phones, fax, scheduling line), credentials, home cards (address, utilities, internet, maintenance, pet, vehicle, anything else), and contacts.
  - **Copy work summary** is built from an explicit allowlist of ordinary fields. A credential number can't be in it.
  - Fax numbers are copy-only, never a `tel:` link. Links only open as `http(s)`.
  - **Protected values** (a DEA number, an account number, a plate…) are saved encrypted on the server and shown only when someone taps **Reveal**. A revealed value is hidden again after 30 seconds or when the app goes to the background. The card says who saved it and who last revealed it.
- **Lists** — items as text tiles: porcelain for what to get, charcoal for Recently used (closed until opened). Tap a tile once you have it (with Undo); tap a recently used one to put it back. Hold a tile (or right-click, or Edit items) to edit or remove it. The "I need…" field sits at the foot of the screen, above the keyboard while typing: it offers matching recently used items, brings one back rather than adding a copy, and warns about a duplicate. A–Z order is kept per device. Clear recently used has Undo. A Recipes list works the same way: one tile per recipe, its ingredients and method in the tile's details.
- **Our story** — the heart tab: a timeline of your moments by year (title, day, place, a few words) with their photos. Photos are shrunk on the phone (1,600 px, JPEG, without location data), kept privately in the database and served only to the two of you; tap one to view full screen and swipe between them; Remove has Undo. A photo no moment lists any more is cleared by the daily clean-up. Wedding is a folder at the top.
- **Wedding** — a folder inside Our story: a countdown to the date, the venue with Directions, the day's schedule, and four sections. Checklist (tasks in the wedding plan, dated, assigned, on the calendar), Vendors (contact, booked or considering, deposit none / due / paid; a deposit due shows on the calendar), Budget (planned and paid per line against an overall budget, with a bar) and Guests (whose side, people in the party, a one-tap RSVP with Undo, table and meal). Home shows the countdown. The tab takes a deep magenta hue while it is open.
- **Plans** — tasks and plans with steps. A recurring task either follows a schedule (from the due date) or repeats a set time after it's done. Month ends don't drift (Jan 31 → Feb 28 → Mar 31). Completing is idempotent and creates exactly one next occurrence, even from two phones at once; Undo takes it back if nobody has touched it.
- **Settings** — who you're signed in as and Sign out, the **Trash** (30 days, Restore), **Export** (ordinary data as JSON; never protected values), install steps.
- **Sharing** — everything is shared by both of you. A name on a card is attribution, not privacy.

## How it's built

```
Phone ──► Cloudflare Access (sign-in, the two emails only)
            │ adds a signed token to every request
            ▼
          Worker (worker/) ── checks the token on every request, page or API
            ├── /api/*  → D1 database (rows scoped by household_id)
            │             protected values: AES-256-GCM with PROTECTED_DATA_KEY
            └── else    → the built app (dist/), with the security headers
```

- **Sign-in.** Access lets only your two emails in. The Worker independently checks the Access token's RS256 signature against your team's published keys, its audience, issuer and expiry, then maps the email to Jeffrey or Zul (`MEMBER_EMAILS`). Anything the browser says about identity is ignored. Missing or placeholder settings make every request fail closed with a plain "Not set up yet" message.
- **Data.** One `records` table holds every household record as validated JSON, with a `version` per record. Every write names the version it started from; a stale write gets `409` and the current record, so nothing is silently overwritten. Deleting moves to a 30-day trash (a list takes its items along, a plan its tasks); a daily schedule purges older items. A unique index makes a second "next occurrence" for the same due date impossible. Schema: [`migrations/0001_init.sql`](migrations/0001_init.sql).
- **Protected values** live only in `protected_values`, encrypted with AES-256-GCM (random 96-bit IV each, bound to household, record and field as additional data, so a value can't be moved onto another record). They're decrypted only by the explicit reveal call, never logged, and never in state, search, summaries or exports. Each reveal, save, removal and export is recorded (who and when, never the value).
- **The app** applies each change at once, then confirms it with the server; if the save fails, the screen goes back to the last saved version and an alert offers Retry. Changes to the same record go out in order. It refreshes quietly every 15 seconds while open (and on returning to it), using an ETag so an unchanged household costs almost nothing. Household data lives only in memory on the phone.
- **Offline.** The service worker caches only static files (an explicit allowlist) and never touches `/api`, `/cdn-cgi`, sign-in routes or exports. Shared lists are the one exception to keeping nothing on the device: the server's copy of lists and their items (nothing else) is kept in the phone's storage, so a list opens in a shop with no signal. Ticks, put-backs and new items made offline (or when a save gets no answer within 10 seconds) wait in an outbox on the phone and are sent on reconnect against the server's current versions; a new item keeps its id, so it can never arrive twice. Editing, pinning and clearing wait for a connection. Every other page says "Connect to view or update your shared information." Signing out, or a not-a-member answer, removes the copy and anything waiting. Each build gives the worker a new cache name, so a deploy shows "A new version is ready".
- **Security headers** on every response: the CSP (no inline script or style, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, a restrictive `Permissions-Policy`, HSTS. Writes must be same-origin JSON.
- **The demo** (`--mode demo`) uses an in-memory backend with the server's rules and never makes a network request. The production build contains none of it — no demo content, no "viewing as" switch, no simulated failure — and the build fails if it ever does.

## Configuration names

| Name | Kind | Set where | Value |
|---|---|---|---|
| `DB` | D1 binding | `wrangler.jsonc` → `d1_databases` | your D1 database's `database_id` |
| `ASSETS` | static assets binding | `wrangler.jsonc` → `assets` | `./dist` (already set) |
| `ACCESS_TEAM_DOMAIN` | variable | `wrangler.jsonc` → `vars` | `the-elite-connection.cloudflareaccess.com` (set) |
| `ACCESS_AUD` | variable | `wrangler.jsonc` → `vars` | the Z ♥ J Access application's Audience (AUD) tag |
| `HOUSEHOLD_ID` | variable | `wrangler.jsonc` → `vars` | `zj` (keep it) |
| `MEMBER_EMAILS` | **secret** | dashboard → Variables and Secrets, or `npx wrangler secret put` | `jeffrey:<Jeffrey's email>,zul:<Zul's email>` |
| `PROTECTED_DATA_KEY` | **secret** | dashboard → Variables and Secrets, or `npx wrangler secret put` | base64 of 32 random bytes — see below |
| address | `workers_dev` | `wrangler.jsonc` | `https://z-heart-j.jshenrheum.workers.dev` |

The emails and the key are secrets on purpose: they never go into this repository.

## Deploy

Deployed. It lives in the same Cloudflare account as RheumDx, but with everything of its own — Worker `z-heart-j`, database `z-heart-j`, its own Access application and secrets — so RheumDx is untouched. All of it can be done in the Cloudflare dashboard, from a phone if need be.

1. **Database.** Storage & databases → D1 → Create database → name `z-heart-j`. Put its Database ID into `wrangler.jsonc` (`database_id`) and push.
2. **Connect the repository.** Workers & Pages → Create → Import a repository → GitHub → `Z-Heart-J` (give Cloudflare's GitHub app access to it if asked). Project name `z-heart-j`; build command `npm run build`; deploy command `npm run db:migrate && npx wrangler deploy`. Every push to `main` then deploys, applying new migrations first. Until step 4 is done the site answers "Not set up yet" — it refuses everyone while a setting is missing.
3. **Access.** Zero Trust → Access → Applications → Add an application → Self-hosted. Domain `z-heart-j.jshenrheum.workers.dev`, no path. One policy: **Allow**, Include → **Emails** → your two addresses, nothing else. Save, copy its **Audience (AUD) tag** into `ACCESS_AUD` in `wrangler.jsonc`, and push. (A new application, not RheumDx's: the Worker only accepts sign-ins made for this one.)
4. **Secrets.** Workers & Pages → `z-heart-j` → Settings → Variables and Secrets → Add, type **Secret**:
   - `MEMBER_EMAILS` = `jeffrey:<Jeffrey's email>,zul:<Zul's email>`
   - `PROTECTED_DATA_KEY` = the key (next section)

   Secrets stay through later deploys.
5. **Phones.** Open https://z-heart-j.jshenrheum.workers.dev, sign in, then install: iPhone Safari → Share → Add to Home Screen; Android Chrome → ⋮ → Install app.

Open copies of the app offer "A new version is ready" after each deploy. Session length is set on the Access application; when it ends, the app says "Your sign-in has expired" and saves nothing until you sign in again.

### The encryption key: where it's made and kept

I have not generated or stored a key, and won't. The key decides whether protected values can ever be read: if it's lost, they can't be recovered (you'd re-enter them); if it leaks together with a copy of the database, they can be read. Cloudflare keeps a secret write-only — you can replace it but never read it back — so **your backup is the only copy**.

Recommended: make it on your own computer and keep the backup in the password manager you already share.

1. Generate 32 random bytes, base64-encoded (44 characters), with any one of:
   - macOS / Linux: `openssl rand -base64 32`
   - Windows PowerShell 7: `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
   - Node: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Phone only: your password manager's generator, **43 characters, letters and numbers only**, then type **`=`** at the end (44 in all).
2. Save it straight away in your password manager as **“Z ♥ J — PROTECTED_DATA_KEY”** (a shared vault, so either of you can recover it).
3. Paste it as the `PROTECTED_DATA_KEY` secret (step 4 above, or `npx wrangler secret put PROTECTED_DATA_KEY`).
4. Clear the terminal. Don't put the key in this repository, a chat, an email, a note or a screenshot.

Changing the key later makes values saved under the old one unreadable: the app says “saved with a different encryption key” instead of showing them. To rotate, put the old key back if needed, or re-enter the values after setting the new one.

## Still to do

Decided: your existing Cloudflare account, the address `z-heart-j.jshenrheum.workers.dev`, and the key made and kept by you. Left: the D1 Database ID and the Access AUD tag go into `wrangler.jsonc` (not secrets); the two emails and the key go in as secrets (Deploy, step 4).

## Layout

```
worker/          the Worker: index (headers, routing), auth (Access token), api (handlers), db (D1), crypto (AES-GCM), csp
migrations/      D1 schema
src/
  data/          types, store (optimistic changes, rollback, conflicts, refresh), api client, backend interface
  demo/          demo-only: placeholder rows, in-memory backend, demo banner and controls
  lib/           records (wire format + validation, shared with the Worker), dates, recurrence, tasks, search, summary, router, pwa…
  components/ pages/
public/          manifest, service worker, offline page, icons, wordmark
scripts/         local-preview (signed-in app locally), preview-demo, check-dist, contrast, icons
tools/           local-worker: runs the real Worker in workerd with local D1 and a stand-in Access issuer (tests and preview)
tests/ e2e/      unit tests, Worker tests, browser checks
docs/            validation reports
```

## Notes for whoever maintains this

- Dates are `YYYY-MM-DD` strings with UTC day arithmetic, so daylight saving can't shift a due date. "Today" is the household's day in `America/New_York` (`HOUSEHOLD_TZ` in `src/lib/dates.ts`) — on the server for completions.
- `src/lib/records.ts` is the single allowlist of what each kind of record may contain; the Worker refuses anything else. Adding a field means adding it there.
- Schema changes are new files in `migrations/` (never edit an applied one). `npm run db:migrate:local` tries them against a local D1 first.
- No inline scripts or styles anywhere, so the CSP needs no exceptions.
- Every control does something useful or is absent; where something isn't available (the demo), the screen says so in words.
- RheumDx is not touched, and no database is shared with it.
