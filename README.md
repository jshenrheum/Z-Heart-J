# Z ♥ J

A private, quiet place for Jeffrey and Zul to keep the practical details of their life — work numbers, the home address, the vet, the AC filter size — and a few small shared lists and tasks. Installable on both phones as an app.

**Status: Stages 1–3 built and verified locally. Not deployed.** Deploying needs four things only you can provide (see [What I need from you](#what-i-need-from-you)). Results and what is *not* yet verified: [`docs/validation.md`](docs/validation.md).

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
| `npm test` | 41 unit tests: dates and time zone, recurrence, completion and undo, work-summary allowlist, search ranking and protected-value exclusion, record validation |
| `npm run test:worker` | 42 tests of the real Worker in workerd with a real local D1: sign-in (forged, expired, wrong audience, not a member), setup errors, headers, validation, 409 conflicts, trash and purge, task completion races, encryption, export, household scoping |
| `npm run contrast` | WCAG contrast for every text and control colour pairing (30) |
| `npm run e2e` | 65 browser checks on the demo build (serve it with `npm run preview:demo` first) |
| `npm run e2e:live` | 19 browser checks on the production build behind the local Worker, with two phones (Jeffrey and Zul) |
| `npm run build` | Also refuses a production build containing any demo content or demo control, inline script or style, or source maps (`scripts/check-dist.mjs`) |

If your installed Chromium differs from the one Playwright expects, set `CHROMIUM_PATH` for the two browser suites.

## What it does

- **Home** — search, your pinned shortcuts, shared lists with one-tap add, what's coming up.
- **Our Info** — each person's work details and locations (address, phones, fax, scheduling line), credentials, home cards (address, utilities, internet, maintenance, pet, vehicle, anything else), and contacts.
  - **Copy work summary** is built from an explicit allowlist of ordinary fields. A credential number can't be in it.
  - Fax numbers are copy-only, never a `tel:` link. Links only open as `http(s)`.
  - **Protected values** (a DEA number, an account number, a plate…) are saved encrypted on the server and shown only when someone taps **Reveal**. A revealed value is hidden again after 30 seconds or when the app goes to the background. The card says who saved it and who last revealed it.
- **Lists** — add, check (with Undo), edit, reorder, clear checked (with Undo), duplicate warning.
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
- **Offline.** The service worker caches only static files (an explicit allowlist) and never touches `/api`, `/cdn-cgi`, sign-in routes or exports. Offline, the app says "Connect to view or update your shared information." Each build gives the worker a new cache name, so a deploy shows "A new version is ready".
- **Security headers** on every response: the CSP (no inline script or style, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, a restrictive `Permissions-Policy`, HSTS. Writes must be same-origin JSON.
- **The demo** (`--mode demo`) uses an in-memory backend with the server's rules and never makes a network request. The production build contains none of it — no demo content, no "viewing as" switch, no simulated failure — and the build fails if it ever does.

## Configuration names

| Name | Kind | Set where | Value |
|---|---|---|---|
| `DB` | D1 binding | `wrangler.jsonc` → `d1_databases` | your D1 database's `database_id` |
| `ASSETS` | static assets binding | `wrangler.jsonc` → `assets` | `./dist` (already set) |
| `ACCESS_TEAM_DOMAIN` | variable | `wrangler.jsonc` → `vars` | `<your-team>.cloudflareaccess.com` |
| `ACCESS_AUD` | variable | `wrangler.jsonc` → `vars` | the Access application's Audience (AUD) tag |
| `HOUSEHOLD_ID` | variable | `wrangler.jsonc` → `vars` | `zj` (keep it) |
| `MEMBER_EMAILS` | **secret** | `npx wrangler secret put MEMBER_EMAILS` | `jeffrey:<Jeffrey's email>,zul:<Zul's email>` |
| `PROTECTED_DATA_KEY` | **secret** | `npx wrangler secret put PROTECTED_DATA_KEY` | base64 of 32 random bytes — see below |
| production hostname | route | `wrangler.jsonc` → `routes` | e.g. `zj.example.com`, on a domain in your Cloudflare account |

The emails and the key are secrets on purpose: they never go into this repository.

## Deploy

Nothing has been deployed. When you're ready (about 20 minutes), on your own computer:

1. **Cloudflare.** `npm install`, then `npx wrangler login`.
2. **Database.** `npx wrangler d1 create z-heart-j`, copy the printed `database_id` into `wrangler.jsonc`, then `npm run db:migrate`.
3. **Hostname.** Put your production hostname in `wrangler.jsonc` → `routes` (a subdomain of a domain already in your Cloudflare account).
4. **Access.** In Cloudflare **Zero Trust → Access → Applications → Add an application → Self-hosted**: application domain = your hostname, no path (the whole site). Add one policy: **Allow**, Include → **Emails** → your two addresses. Save, then copy the application's **Audience (AUD) tag** into `ACCESS_AUD`, and your team domain (shown in Zero Trust settings, in the form `<team>.cloudflareaccess.com`) into `ACCESS_TEAM_DOMAIN`. Choose the session length you're comfortable with; when it ends, the app says "Your sign-in has expired" and saves nothing until you sign in again.
5. **Who's who.** `npx wrangler secret put MEMBER_EMAILS` and enter `jeffrey:<email>,zul:<email>`.
6. **Encryption key** — next section.
7. **Ship.** `npm run deploy` (typecheck, production build with its checks, then upload). The Worker is reachable only on your hostname: the `workers.dev` and preview URLs, which would sit outside Access, are off.
8. **Phones.** Open the hostname, sign in, then install: iPhone Safari → Share → Add to Home Screen; Android Chrome → ⋮ → Install app.

Later changes: `npm run deploy` again; new migrations with `npm run db:migrate` first. Open copies of the app offer "A new version is ready".

### The encryption key: where it's made and kept

I have not generated or stored a key, and won't. The key decides whether protected values can ever be read: if it's lost, they can't be recovered (you'd re-enter them); if it leaks together with a copy of the database, they can be read. Cloudflare keeps a secret write-only — you can replace it but never read it back — so **your backup is the only copy**.

Recommended: make it on your own computer and keep the backup in the password manager you already share.

1. Generate 32 random bytes, base64-encoded (44 characters), with any one of:
   - macOS / Linux: `openssl rand -base64 32`
   - Windows PowerShell 7: `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
   - Node: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Save it straight away in your password manager as **“Z ♥ J — PROTECTED_DATA_KEY”** (a shared vault, so either of you can recover it).
3. `npx wrangler secret put PROTECTED_DATA_KEY` and paste it at the prompt.
4. Clear the terminal. Don't put the key in this repository, a chat, an email, a note or a screenshot.

Changing the key later makes values saved under the old one unreadable: the app says “saved with a different encryption key” instead of showing them. To rotate, put the old key back if needed, or re-enter the values after setting the new one.

## What I need from you

1. The two email addresses you'll each sign in with (they go into `MEMBER_EMAILS` and the Access policy).
2. A Cloudflare account, and the Access team domain once the Access application exists.
3. The production hostname.
4. Your decision on where the encryption key is generated and backed up (the steps above are my recommendation).

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
