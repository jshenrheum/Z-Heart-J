/* Browser checks for the signed-in app: the production build, served by the real
 * Worker with a local D1 database, behind the local stand-in for Cloudflare Access
 * (scripts/local-preview.ts, started fresh by this script). Two browser contexts
 * play the two phones, Jeffrey's and Zul's.
 *   npm run build && npm run e2e:live
 * Needs `npx playwright install chromium` once, or CHROMIUM_PATH. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');

const PORT = Number(process.env.E2E_PORT || 8790);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'TEST-VALUE-0001'; // a made-up test value, never a real number
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, String(e.message || e).split('\n').slice(0, 4).join(' ⏎ ')]); }
};
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'expected equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };

function startPreview() {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/local-preview.ts', '--port', String(PORT)], { cwd: resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const onData = (d) => { log += d; if (log.includes('local preview of the signed-in app')) res(child); };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => (log += d));
    child.on('exit', (code) => rej(new Error(`preview exited (${code}): ${log}`)));
    setTimeout(() => rej(new Error('preview did not start: ' + log)), 30000);
  });
}

(async () => {
  const preview = await startPreview();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const phone = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('zhj:intro', '1'); } catch {} }); // the opening is checked on the demo build
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
    return { ctx, page };
  };
  const ready = (page) => page.locator('p.state-panel[role=status]').waitFor({ state: 'detached', timeout: 8000 });
  const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await ready(page); };
  const signIn = async (page, who) => {
    await page.goto(BASE + '/');
    await page.getByRole('button', { name: `Sign in as ${who}` }).click();
    await page.waitForURL(BASE + '/');
    await ready(page);
  };
  const nav = (page, name) => page.locator('nav.nav a', { hasText: name }).first();
  const dialog = (page) => page.getByRole('dialog');
  const submit = async (page, name) => { await dialog(page).getByRole('button', { name }).click(); await dialog(page).waitFor({ state: 'detached', timeout: 5000 }); };

  const J = await phone();
  const Z = await phone();

  // ---------------------------------------------------------------- sign-in
  await check('sign-in: without a session every page goes to sign-in (nothing of the app loads)', async () => {
    const res = await J.page.goto(BASE + '/info');
    ok(J.page.url().endsWith('/__local/sign-in'), J.page.url());
    ok(res.ok());
    const api = await J.ctx.request.get(BASE + '/api/state', { maxRedirects: 0 });
    eq(api.status(), 302, 'API without a session');
  });
  await check('sign-in: each phone is who it signed in as; the server decides', async () => {
    await signIn(J.page, 'Jeffrey');
    await signIn(Z.page, 'Zul');
    ok((await J.page.locator('h1').innerText()).includes('Jeffrey'), 'Jeffrey greeting');
    ok((await Z.page.locator('h1').innerText()).includes('Zul'), 'Zul greeting');
  });
  await check('production build: no demo banner, no “viewing as” switch, no simulated failure', async () => {
    await go(J.page, '/settings');
    const t = await J.page.innerText('main');
    ok(t.includes('signed in as Jeffrey'), 'signed-in line');
    ok(!/Demo preview|Viewing as|Make the next save fail/.test(t), 'demo-only controls absent');
    eq(await J.page.locator('.demo-banner').count(), 0, 'no demo banner');
  });
  await check('security headers: CSP with frame-ancestors on the app shell', async () => {
    const r = await J.ctx.request.get(BASE + '/lists');
    ok(/frame-ancestors 'none'/.test(r.headers()['content-security-policy'] || ''), 'CSP header');
    eq(r.headers()['x-frame-options'], 'DENY');
  });

  // ---------------------------------------------------------------- shared lists across two phones
  await check('first run: an empty household offers to start a list', async () => {
    await go(J.page, '/');
    await J.page.locator('#lists summary').click(); // Shared lists folds away until opened
    ok(await J.page.getByRole('button', { name: /Start a shared list/ }).isVisible(), 'empty state with action');
  });
  await check('lists: Jeffrey creates Groceries and adds Milk; it survives a reload', async () => {
    await go(J.page, '/lists');
    await J.page.getByRole('button', { name: 'Create Groceries' }).click();
    await J.page.getByRole('link', { name: /Groceries/ }).first().click();
    await J.page.getByPlaceholder('I need…').fill('Milk');
    await J.page.getByRole('button', { name: /^Add to / }).click();
    await J.page.locator('#to-get .tile', { hasText: 'Milk' }).waitFor();
    await J.page.waitForTimeout(400);
    await J.page.reload({ waitUntil: 'networkidle' });
    await ready(J.page);
    ok(await J.page.locator('#to-get .tile', { hasText: 'Milk' }).first().isVisible(), 'Milk persisted');
  });
  await check('quiet refresh: Zul’s open Groceries list shows Jeffrey’s new item without a reload', async () => {
    await go(Z.page, '/lists');
    await Z.page.getByRole('link', { name: /Groceries/ }).first().click();
    await J.page.getByPlaceholder('I need…').fill('Eggs');
    await J.page.getByRole('button', { name: /^Add to / }).click();
    await Z.page.locator('#to-get .tile', { hasText: 'Eggs' }).waitFor({ timeout: 20000 });
    ok((await Z.page.locator('#to-get .tile', { hasText: 'Eggs' }).getAttribute('class')).includes('tile'), 'arrived');
  });
  await check('failed save: rolls back to the last saved list, alerts, and Retry saves it', async () => {
    await J.page.route('**/api/records', (route) => route.abort('connectionreset'), { times: 1 });
    await J.page.getByPlaceholder('I need…').fill('Honey');
    await J.page.getByRole('button', { name: /^Add to / }).click();
    await J.page.locator('.save-banner').waitFor({ timeout: 5000 });
    eq(await J.page.locator('#to-get .tile', { hasText: 'Honey' }).count(), 0, 'rolled back');
    ok((await J.page.locator('.save-banner').innerText()).includes('Your last saved version is showing'), 'honest wording');
    J.page.errors = J.page.errors.filter((e) => !/ERR_CONNECTION_RESET|Failed to load resource/.test(e));
    await J.page.getByRole('button', { name: 'Retry' }).click();
    await J.page.locator('#to-get .tile', { hasText: 'Honey' }).waitFor({ timeout: 5000 });
    await J.page.waitForTimeout(400);
    await J.page.reload({ waitUntil: 'networkidle' });
    await ready(J.page);
    eq(await J.page.locator('#to-get .tile', { hasText: 'Honey' }).count(), 1, 'saved exactly once');
  });

  // ---------------------------------------------------------------- conflicts
  await check('conflict: a stale edit is refused, the newer version is kept, and saving again is a choice', async () => {
    await go(J.page, '/info/contacts');
    await J.page.getByRole('button', { name: 'Add contact' }).click();
    await dialog(J.page).getByLabel(/^Name/).fill('Test Plumbing');
    await dialog(J.page).getByLabel(/^Category/).fill('Maintenance provider');
    await submit(J.page, 'Add contact');
    const contactUrl = J.page.url();
    await Z.page.goto(contactUrl, { waitUntil: 'networkidle' }); await ready(Z.page);
    // Both open the edit form from the same version.
    await J.page.getByRole('button', { name: 'Edit' }).click();
    await Z.page.getByRole('button', { name: 'Edit' }).click();
    await dialog(Z.page).getByLabel(/^Note/).fill('Zul: ask for Sam');
    await submit(Z.page, 'Save changes');
    await dialog(J.page).getByLabel(/^Note/).fill('Jeffrey: weekdays only');
    await dialog(J.page).getByRole('button', { name: 'Save changes' }).click();
    const note = dialog(J.page).locator('.inline-note-error');
    await note.waitFor({ timeout: 5000 });
    J.page.errors = J.page.errors.filter((e) => !/status of 409/.test(e)); // the refused write, as intended
    ok((await note.innerText()).includes('Zul saved a newer version'), await note.innerText());
    eq(await dialog(J.page).getByLabel(/^Note/).inputValue(), 'Jeffrey: weekdays only', 'his text is still in the form');
    await submit(J.page, 'Save changes'); // the explicit second save replaces Zul’s version
    ok(await J.page.getByText('Jeffrey: weekdays only').isVisible(), 'his version saved');
    await Z.page.reload({ waitUntil: 'networkidle' }); await ready(Z.page);
    ok(await Z.page.getByText('Jeffrey: weekdays only').isVisible(), 'Zul sees the latest');
  });

  // ---------------------------------------------------------------- protected values
  await check('protected: a credential number is saved encrypted and shown only on Reveal', async () => {
    await go(J.page, '/info/r/p-jeffrey');
    await J.page.getByRole('button', { name: 'Add credential' }).click();
    await dialog(J.page).getByLabel(/^Credential/).fill('DEA registration');
    await submit(J.page, 'Add credential');
    await J.page.getByRole('button', { name: 'Add number' }).click();
    await J.page.getByLabel(/^Enter number/).fill(SECRET);
    await J.page.getByRole('button', { name: 'Save encrypted' }).click();
    await J.page.getByText('Protected — saved').waitFor({ timeout: 5000 });
    ok(!(await J.page.innerText('body')).includes(SECRET), 'not on screen until revealed');
    await J.page.getByRole('button', { name: 'Reveal number' }).click();
    await J.page.locator('.value.revealed', { hasText: SECRET }).waitFor({ timeout: 5000 });
    await J.page.getByRole('button', { name: 'Hide' }).click();
    ok(!(await J.page.innerText('body')).includes(SECRET), 'hidden again');
  });
  await check('protected: the other member can reveal it and sees who saved it', async () => {
    await Z.page.goto(J.page.url(), { waitUntil: 'networkidle' }); await ready(Z.page);
    ok(await Z.page.getByText(/Saved by Jeffrey/).isVisible(), 'saved-by line');
    await Z.page.getByRole('button', { name: 'Reveal number' }).click();
    await Z.page.locator('.value.revealed', { hasText: SECRET }).waitFor({ timeout: 5000 });
    await Z.page.getByRole('button', { name: 'Hide' }).click();
  });
  await check('protected: never in search, the work summary, the shared data, or the export', async () => {
    await go(J.page, '/info/r/p-jeffrey');
    await J.page.getByRole('button', { name: 'Add location' }).click();
    await dialog(J.page).getByLabel(/^Location name/).fill('Clinic');
    await dialog(J.page).getByLabel(/^Main phone/).fill('(555) 010-0100');
    await submit(J.page, 'Add location');
    await J.page.getByRole('button', { name: 'Copy work summary' }).click();
    await J.page.waitForTimeout(200);
    const clip = await J.page.evaluate(() => navigator.clipboard.readText());
    ok(clip.includes('Clinic') && !clip.includes(SECRET) && !/DEA/.test(clip), 'summary: ' + clip);
    await go(J.page, '/search');
    await J.page.locator('input[type=search]').fill(SECRET);
    await J.page.getByText('Nothing saved matches that.').waitFor({ timeout: 3000 });
    await J.page.locator('input[type=search]').fill('dea');
    await J.page.waitForTimeout(200);
    ok((await J.page.locator('.result').first().innerText()).includes('Protected'), 'credential found by name, value withheld');
    const state = await J.page.evaluate(() => fetch('/api/state').then((r) => r.text()));
    ok(!state.includes(SECRET), 'not in the shared data');
    await go(J.page, '/settings');
    const [download] = await Promise.all([J.page.waitForEvent('download'), J.page.getByRole('link', { name: 'Download export' }).click()]);
    const file = await download.path();
    const text = require('node:fs').readFileSync(file, 'utf8');
    ok(/z-heart-j-export-\d{4}-\d{2}-\d{2}\.json/.test(download.suggestedFilename()), download.suggestedFilename());
    ok(text.includes('Test Plumbing') && text.includes('"hasValue": true'), 'export has ordinary data and says a value exists');
    ok(!text.includes(SECRET), 'export never has the value');
  });

  // ---------------------------------------------------------------- shared calendar
  await check('calendar: an event Jeffrey adds for both of you is on Zul’s calendar, in her view too', async () => {
    const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
    const day = ny.format(new Date(Date.now() + 10 * 86_400_000));
    await go(J.page, '/calendar');
    await J.page.getByRole('button', { name: 'New event' }).click();
    await dialog(J.page).getByLabel(/^What/).fill('Dinner reservation');
    await dialog(J.page).getByLabel(/^Date/).fill(day);
    await dialog(J.page).getByLabel(/^Starts/).fill('19:00');
    await dialog(J.page).getByLabel(/^Where/).fill('1 Placeholder Lane');
    await submit(J.page, 'Add event');
    ok((await J.page.locator('main').innerText()).includes('7:00 PM'), 'event page');
    await go(Z.page, `/calendar?who=zul&m=${day.slice(0, 7)}&d=${day}`);
    const zDay = await Z.page.locator('#cal-day-h').locator('..').locator('..').innerText();
    ok(zDay.includes('Dinner reservation') && zDay.includes('Both'), zDay);
  });

  // ---------------------------------------------------------------- tasks, trash
  await check('tasks: completing a recurring task makes one next occurrence; Undo takes it back', async () => {
    await go(J.page, '/plans');
    await J.page.getByRole('button', { name: 'New task' }).click();
    await dialog(J.page).getByLabel(/^Task/).fill('Replace AC filter');
    await dialog(J.page).getByLabel(/^Due date/).fill('2026-11-06');
    await dialog(J.page).getByLabel(/^Repeat/).selectOption('schedule');
    await dialog(J.page).getByLabel(/^Every how many/).fill('3');
    await submit(J.page, 'Add task');
    await J.page.getByRole('checkbox', { name: /Mark “Replace AC filter” done/ }).click();
    await J.page.getByText(/Next one: .*Feb 6, 2027/).waitFor({ timeout: 5000 });
    eq(await J.page.locator('.task', { hasText: 'Replace AC filter' }).count(), 1, 'one open occurrence');
    await J.page.getByRole('button', { name: 'Undo' }).click();
    await J.page.waitForTimeout(600);
    await J.page.reload({ waitUntil: 'networkidle' }); await ready(J.page);
    eq(await J.page.locator('.task', { hasText: 'Replace AC filter' }).count(), 1, 'still one after undo');
    ok((await J.page.locator('.task', { hasText: 'Replace AC filter' }).innerText()).includes('Nov 6'), 'original due date back');
  });
  await check('trash: a deleted contact waits in the trash, and Restore brings it back for both', async () => {
    await go(J.page, '/info/contacts');
    await J.page.getByRole('link', { name: /Test Plumbing/ }).first().click();
    await J.page.getByRole('button', { name: 'Edit' }).click();
    await dialog(J.page).getByRole('button', { name: 'Move to trash' }).click();
    await J.page.getByText(/Moved “Test Plumbing” to the trash/).waitFor({ timeout: 5000 });
    await go(Z.page, '/settings/trash');
    const entry = Z.page.locator('.trash-entry', { hasText: 'Test Plumbing' });
    ok((await entry.innerText()).includes('Deleted by Jeffrey'), await entry.innerText());
    await entry.getByRole('button', { name: /Restore/ }).click();
    await Z.page.getByText('The trash is empty.').waitFor({ timeout: 5000 });
    await go(J.page, '/info/contacts');
    ok(await J.page.getByRole('link', { name: /Test Plumbing/ }).first().isVisible(), 'back for Jeffrey');
  });

  // ---------------------------------------------------------------- offline, caching, session
  await check('offline: says to connect, keeps nothing on the device, recovers', async () => {
    await J.ctx.setOffline(true);
    await J.page.waitForTimeout(300);
    ok((await J.page.innerText('main')).includes('Connect to view or update your shared information.'), 'offline message');
    await J.ctx.setOffline(false);
    await J.page.waitForTimeout(800);
    eq(await J.page.locator('.offline-panel').count(), 0, 'back');
  });
  await check('service worker: caches only the static shell — never /api or household data', async () => {
    await J.page.evaluate(() => navigator.serviceWorker.ready);
    const keys = await J.page.evaluate(async () => { const out = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname); return out; });
    ok(keys.length > 0, 'something cached');
    const bad = keys.filter((k) => !(k === '/index.html' || k.startsWith('/assets/') || k.startsWith('/icons/') || ['/offline.html', '/offline.css', '/manifest.webmanifest', '/favicon.svg', '/wordmark.svg'].includes(k)));
    ok(bad.length === 0, 'unexpected cached paths: ' + bad.join(', '));
  });
  await check('session expiry: the app says so and saves nothing until you sign in again', async () => {
    await go(Z.page, '/lists');
    await Z.ctx.clearCookies(); // the Access session ends
    await Z.page.getByRole('link', { name: /Groceries/ }).first().click();
    await Z.page.getByPlaceholder('I need…').fill('Bread');
    await Z.page.getByRole('button', { name: /^Add to / }).click();
    await Z.page.getByText('Your sign-in has expired').waitFor({ timeout: 5000 });
    await Z.page.getByRole('button', { name: 'Sign in again' }).click();
    await Z.page.waitForURL(/__local\/sign-in/);
    await signIn(Z.page, 'Zul');
    await go(Z.page, '/lists/' + (await J.page.evaluate(() => fetch('/api/state').then((r) => r.json()).then((s) => s.rows.find((x) => x.kind === 'list').id))));
    eq(await Z.page.locator('#to-get .tile', { hasText: 'Bread' }).count(), 0, 'nothing was saved while signed out');
  });
  await check('wedding: Jeffrey sets the date; Zul’s Home shows the countdown', async () => {
    await go(J.page, '/wedding');
    await J.page.getByRole('button', { name: 'Set the date' }).first().click();
    const d = J.page.getByRole('dialog');
    await d.getByLabel(/^The date/).fill('2027-06-12');
    await d.getByLabel(/^Venue/).fill('Placeholder Hall');
    await d.getByLabel(/Overall budget/).fill('20,000');
    await d.getByRole('button', { name: 'Save' }).click();
    await d.waitFor({ state: 'detached', timeout: 5000 });
    ok(/^\d+ days$/.test((await J.page.locator('.wed-hero-count').innerText()).trim()), 'countdown');
    await go(Z.page, '/');
    await Z.page.locator('.wed-home').waitFor({ timeout: 20000 });
    ok((await Z.page.locator('.wed-home').innerText()).includes('Placeholder Hall'), 'Zul sees it on Home');
  });
  await check('sign out: ends the session and returns to sign-in', async () => {
    await go(J.page, '/settings');
    await J.page.getByRole('button', { name: 'Sign out' }).click();
    await J.page.waitForURL(/__local\/sign-in/);
    await J.page.goto(BASE + '/lists');
    ok(J.page.url().endsWith('/__local/sign-in'), 'still signed out');
  });
  await check('console: no errors or CSP violations on either phone', async () => {
    const errs = [...J.page.errors, ...Z.page.errors].filter((e) => !/Failed to load resource: the server responded with a status of 30[12]/.test(e));
    ok(errs.length === 0, errs.join('; '));
  });

  await browser.close();
  preview.kill('SIGTERM');
  let failed = 0;
  for (const [pass, name, why] of results) { if (!pass) failed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${why ? '\n        ' + why : ''}`); }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
