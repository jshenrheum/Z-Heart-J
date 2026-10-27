/* Browser checks for the demo build (the Stage 1 journeys, on placeholder data):
 *   npm run build:demo && npm run preview:demo &      (serves dist-demo/ on :4173)
 *   npm run e2e [-- baseUrl]
 * Exits non-zero if any check fails. Needs `npx playwright install chromium` once, or
 * CHROMIUM_PATH pointing at an installed Chromium. The signed-in app has its own
 * checks against the local Worker: e2e/stage2.cjs. */
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, String(e.message || e).split('\n').slice(0, 4).join(' ⏎ ')]); }
};
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'expected equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };

(async () => {
  // CHROMIUM_PATH: optional, for machines whose installed Chromium differs from the playwright package's own.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const newPage = async ({ intro = false, ...opts } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'], ...opts });
    await ctx.clock.setFixedTime(new Date('2026-10-25T15:00:00-04:00')); // dates in assertions assume this day
    // The opening plays once per session; these journeys begin mid-session unless they test it.
    if (!intro) await ctx.addInitScript(() => { try { sessionStorage.setItem('zhj:intro', '1'); } catch {} });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
    return { ctx, page };
  };
  const nav = (page, name) => page.locator('nav.nav a', { hasText: name }).first(); // the app's own nav, never a breadcrumb
  const open = async (page, path) => {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.locator('p.state-panel[role=status]').waitFor({ state: 'detached', timeout: 5000 }); // first load done
  };
  const searchFor = async (page, q) => { const box = page.locator('input[type=search]').first(); await box.fill(q); await page.waitForTimeout(200); };
  const rows = (page) => page.$$eval('.result', (els) => els.map((e) => e.innerText.replace(/\s*\n\s*/g, ' | ')));

  // ---------------------------------------------------------------- opening
  {
    const { ctx, page } = await newPage({ intro: true });
    await check('intro: the mark fades in over a black veil, then gives way to the loaded app', async () => {
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      ok(await page.locator('.intro .intro-mark svg').isVisible(), 'mark shown');
      eq(await page.locator('.intro').getAttribute('aria-hidden'), 'true', 'decorative');
      await page.locator('.intro').waitFor({ state: 'detached', timeout: 4500 });
      ok(await page.locator('.greeting').isVisible(), 'home page beneath');
    });
    await check('intro: once per session (a reload does not replay it)', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      eq(await page.locator('.intro').count(), 0, 'no intro on reload');
    });
    await check('intro: a tap skips it at once, and the tap does nothing else', async () => {
      const p2 = await ctx.newPage(); // a new tab is a new session
      p2.errors = [];
      p2.on('pageerror', (e) => p2.errors.push(e.message));
      await p2.goto(BASE + '/lists', { waitUntil: 'domcontentloaded' });
      await p2.locator('.intro').waitFor({ timeout: 3000 });
      const box = await p2.locator('.intro').boundingBox();
      await p2.mouse.click(box.width / 2, box.height / 2);
      await p2.locator('.intro').waitFor({ state: 'detached', timeout: 1000 });
      ok(p2.url().endsWith('/lists'), 'still on Lists: the tap reached nothing beneath');
      ok(p2.errors.length === 0, p2.errors.join('; '));
      await p2.close();
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage({ intro: true, reducedMotion: 'reduce' });
    await check('intro: never shown with reduced motion', async () => {
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      eq(await page.locator('.intro').count(), 0, 'no intro');
      ok(await page.locator('.greeting').isVisible(), 'home page straight away');
    });
    await ctx.close();
  }

  // ---------------------------------------------------------------- search
  {
    const { ctx, page } = await newPage();
    await open(page, '/');
    await check('search: "my fax" reads as the viewer and returns fax values, copy-only', async () => {
      await searchFor(page, 'my fax');
      const r = await rows(page);
      ok(r.length === 2 && r.every((x) => x.startsWith('Fax | Jeffrey')), `rows: ${JSON.stringify(r)}`);
      eq(await page.locator('.result a[href^="tel:"]').count(), 0, 'fax must never be a tel: link');
      ok((await page.locator('.scope').innerText()).includes('Jeffrey’s records (you)'), 'scope text');
    });
    await check('search: query text never reaches the URL', async () => {
      ok(!decodeURIComponent(page.url()).toLowerCase().includes('fax'), page.url());
    });
    await check('search: protected credential shows a note, never a number', async () => {
      await searchFor(page, 'dea');
      const r = await rows(page);
      ok(r[0].startsWith('DEA registration') && r[0].includes('Protected'), r[0]);
    });
    await check('search: NPI is ordinary and found by number', async () => {
      await searchFor(page, '0000000000');
      ok((await rows(page))[0].startsWith('NPI'), 'NPI first');
    });
    await check('search: "ac" ranks the AC contact first, "vet" the vet contact', async () => {
      await searchFor(page, 'ac'); ok((await rows(page))[0].startsWith('Demo Cool Air Service'), 'ac');
      await searchFor(page, 'vet'); ok((await rows(page))[0].startsWith('Demo Vet Clinic'), 'vet');
    });
    await check('search: no match gives a plain message', async () => {
      await searchFor(page, 'xyzzy');
      ok(await page.getByText('Nothing saved matches that.').isVisible(), 'empty message');
      ok(await page.getByRole('button', { name: /Add information/ }).isVisible(), 'offers to add it');
    });
    await check('search: Call links only for phones (tel: digits only)', async () => {
      await searchFor(page, 'ac');
      const hrefs = await page.$$eval('.result a[href^="tel:"]', (e) => e.map((x) => x.getAttribute('href')));
      ok(hrefs.length > 0 && hrefs.every((h) => /^tel:\d+$/.test(h)), JSON.stringify(hrefs));
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- work summary
  {
    const { ctx, page } = await newPage();
    await open(page, '/info/r/p-jeffrey');
    await check('work summary: copies an allowlisted summary with no protected values', async () => {
      await page.getByRole('button', { name: 'Copy work summary' }).first().click();
      await page.waitForTimeout(200);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      ok(clip.includes('Demo Location A') && clip.includes('(555) 010-0100'), 'summary content: ' + clip);
      ok(!/DEA|license number|credential/i.test(clip), 'summary leaked credential wording: ' + clip);
      ok(await page.getByText(/copied/i).first().isVisible(), 'confirmation toast');
    });
    await check('work summary: fax is copy-only; main phone has a tel: link', async () => {
      eq(await page.locator('a[href="tel:5550100102"]').count(), 0, 'fax tel link');
      eq(await page.locator('a[href="tel:5550100100"]').count(), 1, 'main phone tel link');
    });
    await check('credential page: the demo says plainly it stores no protected values, and offers no number field', async () => {
      await open(page, '/info/r/cred-j1');
      const t = await page.innerText('main');
      ok(/demo preview doesn’t store protected values/.test(t) && /encrypted/i.test(t), 'honest note');
      eq(await page.locator('main input').count(), 0, 'no inputs for credential numbers in the demo');
      eq(await page.getByRole('button', { name: /Reveal|Add number/ }).count(), 0, 'no reveal or entry controls in the demo');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- lists: tiles, recently used, the I need… field
  const need = (page) => page.getByPlaceholder('I need…');
  const toGet = (page, name) => page.locator('#to-get .tile', name ? { hasText: name } : undefined);
  const toGetNames = (page) => page.$$eval('#to-get .tile-name', (e) => e.map((x) => x.textContent.trim()));
  {
    const { ctx, page } = await newPage();
    await open(page, '/lists/groceries');
    await check('list: add an item from the I need… field (optimistic, no reload); the field keeps focus', async () => {
      const before = await toGet(page).count();
      await need(page).fill('Tea');
      await need(page).press('Enter');
      await toGet(page, 'Tea').first().waitFor();
      eq(await toGet(page).count(), before + 1, 'tile count');
      ok(await page.evaluate(() => document.activeElement.classList.contains('dock-input')), 'field still focused');
      eq(await need(page).inputValue(), '', 'field cleared');
    });
    await check('list: tapping a tile checks it off, and Undo brings it back', async () => {
      await page.getByRole('button', { name: /^Check off “Milk”/ }).click();
      await page.waitForTimeout(150);
      eq(await toGet(page, 'Milk').count(), 0, 'Milk left To get');
      const undo = page.getByRole('button', { name: 'Undo' });
      await undo.waitFor({ timeout: 3000 });
      await undo.click();
      await page.waitForTimeout(250);
      ok(await toGet(page, 'Milk').first().isVisible(), 'Milk back in To get');
    });
    await check('list: Recently used starts closed; one tap puts an item back', async () => {
      eq(await page.locator('details.recent').evaluate((d) => d.open), false, 'closed on arrival');
      await page.locator('details.recent summary').click();
      await page.getByRole('button', { name: /^Put back “Rice”/ }).click();
      await page.waitForTimeout(200);
      ok(await toGet(page, 'Rice').first().isVisible(), 'Rice back in To get');
    });
    await check('list: typing shows matching recently used items; Enter on one puts it back instead of a copy', async () => {
      await need(page).fill('chick');
      await page.getByRole('group', { name: 'Recently used' }).getByRole('button', { name: /^Put back “Chicken thighs”/ }).waitFor({ timeout: 2000 });
      await need(page).fill('hand soap');
      await need(page).press('Enter');
      await page.waitForTimeout(200);
      eq(await page.locator('.tile', { hasText: 'Hand soap' }).count(), 1, 'still one Hand soap');
      eq(await toGet(page, 'Hand soap').count(), 1, 'and it is in To get');
      await need(page).fill('shred');
      await page.getByRole('group', { name: 'Recently used' }).getByRole('button', { name: /^Put back “Cheese”, Shredded/ }).click();
      await page.waitForTimeout(200);
      ok(await toGet(page, 'Cheese').first().isVisible(), 'a suggestion tap puts it back');
      eq(await need(page).inputValue(), '', 'field cleared after the tap');
    });
    await check('list: the dock stays above the tab bar and toasts rise above the dock', async () => {
      const dock = await page.locator('.dock').boundingBox();
      const navBox = await page.locator('nav.nav').boundingBox();
      ok(dock.y + dock.height <= navBox.y + 1, `dock bottom ${dock.y + dock.height} vs nav top ${navBox.y}`);
      await page.getByRole('button', { name: /^Check off “Eggs”/ }).click();
      await page.waitForTimeout(300); // after the toast's rise
      const toast = await page.locator('.toast').first().boundingBox();
      ok(toast.y + toast.height <= dock.y, `toast bottom ${toast.y + toast.height} vs dock top ${dock.y}`);
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- holding a tile (touch) opens the editor and checks nothing off
  {
    const { ctx, page } = await newPage({ hasTouch: true, isMobile: true });
    await open(page, '/lists/groceries');
    await check('list: press and hold a tile on a touch screen opens its editor; the item stays on the list', async () => {
      const box = await toGet(page, 'Bananas').first().boundingBox();
      const cdp = await ctx.newCDPSession(page);
      const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
      await page.waitForTimeout(650);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
      const d = page.getByRole('dialog');
      ok(await d.isVisible(), 'editor open (and not closed by the lifting finger)');
      eq(await d.getByLabel(/^Item/).inputValue(), 'Bananas', 'the held item');
      eq(await toGet(page, 'Bananas').count(), 1, 'not checked off');
      await d.getByRole('button', { name: /Close without saving/ }).click();
    });
    await check('list: a quick tap on a touch screen still checks the item off', async () => {
      await toGet(page, 'Bananas').first().tap();
      await page.waitForTimeout(200);
      eq(await toGet(page, 'Bananas').count(), 0, 'checked off');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- failed save, offline (in-app navigation keeps in-memory state)
  {
    const { ctx, page } = await newPage();
    await open(page, '/settings');
    await page.getByLabel(/Make the next save fail/).check();
    await nav(page, 'Lists').click();
    await page.getByRole('link', { name: /Groceries/ }).first().click();
    const honey = () => toGet(page, 'Honey').count();
    await check('failed save: optimistic add rolls back to the last saved list and shows an alert with Retry', async () => {
      await need(page).fill('Honey');
      await page.getByRole('button', { name: /^Add to / }).click();
      eq(await honey(), 1, 'optimistic tile');
      await page.locator('.save-banner').waitFor({ timeout: 3000 });
      eq(await honey(), 0, 'rolled back');
      eq(await page.locator('.save-banner').getAttribute('role'), 'alert', 'banner role');
      ok((await page.locator('.save-banner').innerText()).includes('Your last saved version is showing'), 'honest wording');
    });
    await check('failed save: the alert stays in view even when the page is scrolled down', async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);
      const top = await page.locator('.save-banner').evaluate((e) => e.getBoundingClientRect().top);
      ok(top >= 0 && top < 180, 'banner top at ' + top);
      await page.evaluate(() => window.scrollTo(0, 0));
    });
    await check('failed save: Retry succeeds and clears the banner', async () => {
      await page.getByRole('button', { name: 'Retry' }).click();
      await page.waitForTimeout(500);
      eq(await honey(), 1, 'Honey saved');
      eq(await page.locator('.save-banner').count(), 0, 'banner cleared');
    });
    await check('offline: shows the connect message and recovers when back online', async () => {
      await ctx.setOffline(true); await page.waitForTimeout(300);
      ok((await page.innerText('main')).includes('Connect to view or update your shared information.'), 'offline message');
      await ctx.setOffline(false); await page.waitForTimeout(300);
      eq(await page.locator('.offline-panel').count(), 0, 'panel gone');
      ok(await toGet(page, 'Honey').first().isVisible(), 'list is back');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- managing lists and records
  {
    const { ctx, page } = await newPage();
    await open(page, '/lists/groceries');
    await check('list: duplicate entry is flagged, and a second Enter confirms it', async () => {
      await need(page).fill('milk');
      await need(page).press('Enter');
      await page.getByText(/already on the list/).waitFor({ timeout: 2000 });
      eq((await toGetNames(page)).filter((n) => /^milk$/i.test(n)).length, 1, 'not added yet');
      await need(page).press('Enter');
      await page.waitForTimeout(300);
      eq((await toGetNames(page)).filter((n) => /^milk$/i.test(n)).length, 2, 'added on confirm');
    });
    await check('list: Edit items, then tap a tile to edit it (name and quantity)', async () => {
      await page.getByRole('button', { name: 'Edit items' }).click();
      await page.getByRole('button', { name: /^Edit “Eggs”/ }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel(/^Item/).fill('Free-range eggs');
      await d.getByLabel(/^Quantity/).fill('2 dozen');
      await d.getByRole('button', { name: 'Save' }).click();
      await d.waitFor({ state: 'detached', timeout: 3000 });
      ok((await toGetNames(page)).includes('Free-range eggs'), 'renamed');
      ok(await page.getByText('2 dozen').first().isVisible(), 'quantity shown');
      await page.getByRole('button', { name: 'Done' }).click();
      ok(await page.getByRole('button', { name: /^Check off “Free-range eggs”/ }).isVisible(), 'tiles back to checking off');
    });
    await check('list: A–Z sorts the tiles, and turning it off restores the order they were added', async () => {
      const added = await toGetNames(page);
      await page.getByRole('button', { name: 'A–Z' }).click();
      const sorted = await toGetNames(page);
      eq(JSON.stringify(sorted), JSON.stringify([...added].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))), 'A–Z');
      eq(await page.getByRole('button', { name: 'A–Z' }).getAttribute('aria-pressed'), 'true', 'pressed');
      await page.getByRole('button', { name: 'A–Z' }).click();
      eq(JSON.stringify(await toGetNames(page)), JSON.stringify(added), 'order added');
    });
    await check('list: holding a tile with the mouse opens its editor; removing is undoable', async () => {
      const box = await toGet(page, 'Bananas').first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
      const d = page.getByRole('dialog');
      await d.waitFor({ timeout: 2000 });
      eq(await toGet(page, 'Bananas').count(), 1, 'the hold did not check it off');
      await d.getByRole('button', { name: 'Remove' }).click();
      await page.waitForTimeout(300);
      ok(!(await toGetNames(page)).includes('Bananas'), 'removed');
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.waitForTimeout(300);
      ok((await toGetNames(page)).includes('Bananas'), 'restored');
    });
    await check('list: clearing Recently used is undoable', async () => {
      await page.locator('details.recent summary').click();
      await page.getByRole('button', { name: 'Clear recently used' }).click();
      await page.getByRole('alertdialog').waitFor();
      ok((await page.getByRole('alertdialog').innerText()).includes('both of you'), 'shared-data warning shown');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Clear' }).click();
      await page.waitForTimeout(300);
      eq(await page.locator('.tile', { hasText: 'Olive oil' }).count(), 0, 'recently used item gone');
      eq(await page.locator('details.recent').count(), 0, 'section gone when empty');
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.waitForTimeout(300);
      if (!(await page.locator('details.recent').evaluate((d) => d.open))) await page.locator('details.recent summary').click();
      eq(await page.locator('.tile-recent', { hasText: 'Olive oil' }).count(), 1, 'recently used item back');
    });
    await check('list: a new list can be created and opened', async () => {
      await nav(page, 'Lists').click();
      await page.getByRole('button', { name: 'New list' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel(/^(Name|Title|List)/).first().fill('Hardware store');
      await d.getByRole('button', { name: /^(Create|Save|Add)/ }).click();
      await d.waitFor({ state: 'detached', timeout: 3000 });
      ok(await page.getByText('Hardware store').first().isVisible(), 'new list visible');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  {
    const { ctx, page } = await newPage();
    await open(page, '/settings');
    await check('viewing as Zul: "my fax" now means Zul’s fax', async () => {
      await page.getByRole('button', { name: 'Zul', exact: true }).click();
      await nav(page, 'Home').click();
      await searchFor(page, 'my fax');
      const r = await rows(page);
      ok(r.length === 1 && r[0].includes('Zul') && r[0].includes('(555) 010-0302'), JSON.stringify(r));
    });
    await check('pin: pinning a record puts it on Home, unpinning removes it', async () => {
      await nav(page, 'Our Info').click();
      await page.getByRole('link', { name: /AC and filter/ }).first().click();
      await page.getByRole('button', { name: 'Pin to Home' }).click();
      await nav(page, 'Home').click();
      ok(await page.locator('.pin-grid').getByText('AC and filter').first().isVisible(), 'pinned on Home');
      await page.getByRole('link', { name: /AC and filter/ }).first().click();
      await page.getByRole('button', { name: /^Pinned/ }).click();
      await nav(page, 'Home').click();
      eq(await page.locator('.pin-grid').getByText('AC and filter').count(), 0, 'unpinned');
    });
    await check('contact: add one, it appears with a tel: link and is searchable', async () => {
      await nav(page, 'Our Info').click();
      await page.getByRole('link', { name: /Contacts/ }).first().click();
      await page.getByRole('button', { name: 'Add contact' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel(/^Name/).fill('Test Plumber');
      await d.getByLabel(/^Category/).fill('Maintenance provider');
      await d.getByLabel(/^Phone/).fill('(555) 010-0999');
      await d.getByRole('button', { name: /^(Save|Add)/ }).last().click();
      await d.waitFor({ state: 'detached', timeout: 3000 });
      eq(await page.locator('a[href="tel:5550100999"]').count(), 1, 'call link');
    });
    await check('work location: editing a phone updates the copied summary', async () => {
      await open(page, '/info/r/loc-j1');
      await page.getByRole('button', { name: 'Edit' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel(/^Main phone/).fill('(555) 010-0111');
      await d.getByRole('button', { name: /^Save/ }).click();
      await d.waitFor({ state: 'detached', timeout: 3000 });
      await page.getByRole('button', { name: 'Copy work summary' }).click();
      await page.waitForTimeout(200);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      ok(clip.includes('(555) 010-0111') && !clip.includes('(555) 010-0100'), clip);
    });
    await check('home record: editing a value updates the page', async () => {
      await open(page, '/info/r/home-hvac');
      await page.getByRole('button', { name: 'Edit' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel(/^Filter size/).fill('20 × 25 × 1');
      await d.getByRole('button', { name: /^Save/ }).click();
      await d.waitFor({ state: 'detached', timeout: 3000 });
      ok(await page.getByText('20 × 25 × 1').first().isVisible(), 'new value visible');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- recurring tasks
  {
    const { ctx, page } = await newPage();
    await open(page, '/plans');
    const taskRow = (title) => page.locator('.task', { hasText: title });
    await check('recurring (schedule): completing creates the next one anchored to the due date', async () => {
      await page.getByRole('checkbox', { name: /Mark “Replace AC filter” done/ }).click();
      await page.waitForTimeout(400);
      const row = taskRow('Replace AC filter').first();
      ok(await row.isVisible(), 'next instance present');
      ok((await row.innerText()).includes('Feb 6, 2027'), 'next due is 3 months after Nov 6: ' + (await row.innerText()));
    });
    await check('recurring (after completion): next one is 6 months after today, not after the old due date', async () => {
      await page.getByRole('checkbox', { name: /Mark “Test smoke alarms” done/ }).click();
      await page.waitForTimeout(400);
      const row = taskRow('Test smoke alarms').first();
      ok((await row.innerText()).includes('Apr 25, 2027'), 'next due: ' + (await row.innerText()));
    });
    await check('toast: the Undo button stays on one line', async () => {
      const box = await page.locator('.toast-action').first().boundingBox();
      ok(box && box.height < 60 && box.width > 56, JSON.stringify(box));
    });
    await check('completing is undoable and creates no duplicate next instance', async () => {
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.waitForTimeout(400);
      eq(await taskRow('Test smoke alarms').count(), 1, 'one smoke-alarm task after undo');
      ok((await taskRow('Test smoke alarms').first().innerText()).includes('overdue'), 'back to overdue');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- forms
  {
    const { ctx, page } = await newPage();
    await open(page, '/');
    const addTask = async () => { await page.locator('.add-btn').click(); await page.getByRole('menuitem', { name: 'New task' }).click(); await page.getByRole('dialog').waitFor(); };
    await check('form: required title is validated, flagged invalid, and focus returns to it', async () => {
      await addTask();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Add task' }).click();
      eq((await dialog.locator('.field-error').first().innerText()), 'Required', 'message');
      eq(await dialog.locator('[aria-invalid="true"]').count(), 1, 'one invalid field');
      eq(await page.evaluate(() => document.activeElement.getAttribute('aria-invalid')), 'true', 'focus on the invalid field');
    });
    await check('form: unsaved text asks before discarding; Keep editing preserves it; Discard closes and restores focus', async () => {
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/^Task/).fill('Draft that I might lose');
      await page.keyboard.press('Escape');
      await page.getByText('Discard your changes?').waitFor({ timeout: 2000 });
      await page.getByRole('button', { name: 'Keep editing' }).click();
      eq(await dialog.getByLabel(/^Task/).inputValue(), 'Draft that I might lose', 'text kept');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Discard', exact: true }).click();
      eq(await page.getByRole('dialog').count(), 0, 'closed');
      ok(await page.evaluate(() => document.activeElement.classList.contains('add-btn')), 'focus back on the Add button');
    });
    await check('form: a valid task saves, toasts, and shows up on Plans', async () => {
      await addTask();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/^Task/).fill('Call the plumber');
      await dialog.getByRole('button', { name: 'Add task' }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 3000 });
      await nav(page, 'Plans').click();
      await page.locator('.task', { hasText: 'Call the plumber' }).first().waitFor({ timeout: 3000 });
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- calendar (today is Sun, Oct 25 2026 here)
  {
    const { ctx, page } = await newPage();
    const agenda = () => page.locator('#cal-next-h').locator('..').locator('..').innerText();
    await open(page, '/calendar');
    await check('calendar: month, today and the agenda with events, tasks and their times', async () => {
      ok((await page.locator('#cal-month').innerText()) === 'October 2026', 'month title');
      ok((await page.locator('#cal-day-h').innerText()).toLowerCase().includes('today · sun, oct 25'), await page.locator('#cal-day-h').innerText());
      const a = await agenda();
      ok(a.includes('Dinner with friends (demo)') && a.includes('7:30 PM') && a.includes('Get two quotes'), a.slice(0, 300));
      eq(await page.locator('.cal-day[aria-current="date"]').count(), 1, 'today marked once');
    });
    await check('calendar: Zul’s view shows hers and shared, not Jeffrey’s own', async () => {
      await page.getByRole('link', { name: 'Zul’s' }).click();
      await page.waitForTimeout(200);
      const a = await agenda();
      ok(a.includes('Dentist (demo)') && a.includes('Dinner with friends (demo)'), 'hers and both');
      ok(!a.includes('Morning run (demo)'), 'not Jeffrey’s run');
      await page.getByRole('link', { name: 'Everyone' }).click();
    });
    await check('calendar: a new timed event saves, opens, and sits on its day', async () => {
      await page.getByRole('button', { name: 'New event' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel(/^What/).fill('Vet visit');
      await d.getByLabel(/^Whose/).selectOption('zul');
      await d.getByLabel(/^Date/).fill('2026-11-03');
      await d.getByLabel(/^Starts/).fill('09:00');
      await d.getByLabel(/^Ends/).fill('08:00');
      await d.getByRole('button', { name: 'Add event' }).click();
      ok((await d.locator('.field-error').first().innerText()).includes('Ends before it starts'), 'end before start refused');
      await d.getByLabel(/^Ends/).fill('09:30');
      await d.getByRole('button', { name: 'Add event' }).click();
      await d.waitFor({ state: 'detached', timeout: 3000 });
      ok((await page.locator('main').innerText()).includes('Tue, Nov 3 · 9:00 – 9:30 AM'), await page.locator('main').innerText());
      await page.locator('main .back-link').click(); // back to the event's own day
      await page.waitForTimeout(200);
      ok((await page.locator('#cal-day-h').locator('..').locator('..').innerText()).includes('Vet visit'), 'on Nov 3');
    });
    await check('calendar: one day of a repeat can be removed, and Undo puts it back', async () => {
      await open(page, '/calendar/e/ev-run?on=2026-10-26');
      await page.getByRole('button', { name: /Remove Mon, Oct 26 only/ }).click();
      await page.waitForTimeout(400);
      const day = () => page.locator('#cal-day-h').locator('..').locator('..').innerText();
      ok((await page.locator('#cal-day-h').innerText()).toLowerCase().includes('oct 26'), 'back on that day');
      ok(!(await day()).includes('Morning run'), 'removed from Oct 26');
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.waitForTimeout(400);
      ok((await day()).includes('Morning run'), 'back after Undo');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- structural accessibility audit
  {
    const { ctx, page } = await newPage();
    const audit = () => page.evaluate(() => {
      const ids = {};
      document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
      const dupes = Object.keys(ids).filter((k) => ids[k] > 1);
      const nameOf = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.labels && e.labels.length) || e.textContent || e.getAttribute('title') || '').toString().trim();
      const unnamed = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')].filter((e) => !nameOf(e)).map((e) => e.tagName.toLowerCase() + '.' + e.className);
      const h1 = document.querySelectorAll('h1').length;
      const imgNoAlt = [...document.querySelectorAll('img:not([alt])')].length;
      return { dupes, unnamed, h1, imgNoAlt };
    });
    for (const route of ['/', '/info', '/info/contacts', '/info/r/p-jeffrey', '/info/r/cred-j1', '/info/r/home-hvac', '/info/r/contact-vet', '/lists', '/lists/groceries', '/plans', '/plans/p/plan-home', '/settings', '/settings/trash', '/calendar', '/calendar/e/ev-dinner', '/calendar/e/ev-run', '/search', '/no-such-page']) {
      await check(`a11y structure ${route}: one h1, unique ids, every control named`, async () => {
        await open(page, route);
        const r = await audit();
        eq(r.h1, 1, 'h1 count'); eq(r.dupes.join(','), '', 'duplicate ids'); eq(r.unnamed.join(','), '', 'unnamed controls'); eq(r.imgNoAlt, 0, 'img without alt');
      });
    }
    await check('a11y structure: every form sheet has unique ids and named fields', async () => {
      await open(page, '/');
      for (const item of ['New task', 'Add information']) {
        await page.locator('.add-btn').click();
        await page.getByRole('menuitem', { name: item }).click();
        await page.getByRole('dialog').waitFor();
        const r = await audit();
        eq(r.dupes.join(','), '', `${item}: duplicate ids`); eq(r.unnamed.join(','), '', `${item}: unnamed`);
        await page.getByRole('button', { name: 'Close without saving' }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 2000 });
      }
    });
    await check('a11y: first Tab reaches the skip link, and it moves focus to main content', async () => {
      await open(page, '/lists');
      await page.keyboard.press('Tab');
      ok(await page.evaluate(() => document.activeElement.classList.contains('skip')), 'skip link is first');
      await page.keyboard.press('Enter');
      eq(await page.evaluate(() => document.activeElement.id), 'main', 'focus on main');
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- service worker & manifest
  {
    const { ctx, page } = await newPage();
    await open(page, '/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    await check('pwa: manifest is installable (standalone, id, any + maskable icons)', async () => {
      const m = await (await ctx.request.get(BASE + '/manifest.webmanifest')).json();
      eq(m.display, 'standalone', 'display'); eq(m.start_url, '/', 'start_url'); ok(m.id, 'id');
      ok(m.icons.some((i) => i.sizes === '512x512' && /maskable/.test(i.purpose)) && m.icons.some((i) => i.sizes === '192x192'), 'icons');
    });
    await check('pwa: service worker caches only static allowlisted paths; /api is never cached', async () => {
      await page.evaluate(() => fetch('/api/anything').catch(() => null));
      page.errors = page.errors.filter((e) => !/status of 404/.test(e)); // the deliberate /api probe
      const keys = await page.evaluate(async () => { const out = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname); return out; });
      ok(keys.length > 0, 'something precached');
      const bad = keys.filter((k) => !(k === '/index.html' || k.startsWith('/assets/') || k.startsWith('/icons/') || ['/offline.html', '/offline.css', '/manifest.webmanifest', '/favicon.svg', '/wordmark.svg'].includes(k)));
      ok(bad.length === 0, 'unexpected cached paths: ' + bad.join(', '));
    });
    await check('pwa: a new deploy shows “A new version is ready”; the refresh switches to it and drops the old cache', async () => {
      const fs = require('node:fs');
      const swPath = require('node:path').resolve(__dirname, '..', 'dist-demo', 'sw.js');
      ok(fs.existsSync(swPath) && /^http:\/\/(127\.0\.0\.1|localhost):/.test(BASE), 'needs the local demo preview of dist-demo/');
      const original = fs.readFileSync(swPath, 'utf8');
      try {
        fs.writeFileSync(swPath, original.replace(/zhj-shell-[a-z0-9]+/, 'zhj-shell-nextdeploy')); // the next build's worker
        await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
        await page.locator('.update-banner').waitFor({ timeout: 10000 });
        await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: /Update available/ }).click()]);
        await page.waitForTimeout(500);
        const names = await page.evaluate(() => caches.keys());
        ok(names.length > 0 && names.every((n) => n === 'zhj-shell-nextdeploy'), JSON.stringify(names));
        eq(await page.locator('.update-banner').count(), 0, 'banner gone after the refresh');
      } finally {
        fs.writeFileSync(swPath, original);
      }
    });
    await check('pwa: offline cold start opens the app and says to connect (no household data)', async () => {
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForTimeout(500);
      const t = await page.innerText('body');
      ok(t.includes('Connect to view or update your shared information.'), 'offline message: ' + t.slice(0, 120));
      ok(!t.includes('Demo Location A'), 'no household data offline');
      await ctx.setOffline(false);
    });
    await check('console: no errors during this group', async () => ok(page.errors.length === 0, page.errors.join('; ')));
    await ctx.close();
  }

  // ---------------------------------------------------------------- report
  await browser.close();
  let failed = 0;
  for (const [pass, name, why] of results) { if (!pass) failed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${why ? '\n        ' + why : ''}`); }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
