// Automated manual test in Chrome for Testing: loads the extension from .output/chrome-mv3,
// opens some pages, opens the side panel as a page and presses "Apply".
// Usage: npm run build && node scripts/smoke.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const extPath = path.resolve('.output/chrome-mv3');
// Fake OpenAI-compatible Generator: puts all the tabs in "Lettura Veloce", or answers 500.
// With `unsure` the fake System One answers with low confidence for the /c and /d pages.
const ai = { fail: false, hang: false, unsure: false, requests: [] };
const server = http.createServer(async (req, res) => {
  if (req.url === '/v1/systemone') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    ai.requests.push({ systemone: request });
    res.setHeader('content-type', 'application/json');
    // All the tabs in the first category, with high confidence.
    const choice = Object.keys(request.questions.group.criteria)[0];
    const confidence = ai.unsure && /Pagina \/[cd]/.test(JSON.stringify(request.state)) ? 0.3 : 0.95;
    return res.end(JSON.stringify({ answers: { group: { type: 'choice', choice, confidence, probabilities: {} } } }));
  }
  if (req.url === '/v1/chat/completions') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    ai.requests.push(request);
    res.setHeader('content-type', 'application/json');
    if (ai.hang) return; // no answer: it only ends with the timeout or with "Stop"
    if (ai.fail) {
      res.statusCode = 500;
      return res.end('{}');
    }
    if (request.messages[0].content.includes('description of a category')) {
      return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Pagine da leggere con calma.' } }] }));
    }
    const tabs = request.messages.length > 1 ? JSON.parse(request.messages[1].content).tabs ?? [] : [];
    // Step 2 of the pipeline ("new only"): a different name, to recognize it in the proposal.
    const name = request.messages[0].content.includes('Do not reuse') ? 'Nuovo Tema' : 'Lettura Veloce';
    const content = JSON.stringify({ groups: [{ name, tabs: tabs.map((t) => t.id) }] });
    return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
  }
  res.setHeader('content-type', 'text/html');
  const path = req.url.split('?')[0];
  // The /e page has an empty meta description: og:description is used instead.
  const meta = path === '/e'
    ? `<meta name="description" content=""><meta property="og:description" content="Descrizione og ${path}">`
    : `<meta name="description" content="Descrizione ${path}">`;
  res.end(`<!doctype html><title>Pagina ${path}</title>${meta}<h1>${req.url}</h1>`);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [extPath],
  args: ['--lang=it'],
});
const errors = [];
/** One check: prints it and, if it does not pass, stops the smoke test with an error (exit code 1). */
const check = (label, ok) => {
  console.log(`${label}:`, ok);
  if (!ok) throw new Error(`Check failed: ${label}`);
};
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'));
  const sw = await swTarget.worker();
  sw.on('console', (m) => m.type() === 'error' && errors.push(`[sw] ${m.text()}`));
  const extId = new URL(swTarget.url()).host;

  // First-run guide: it opens by itself on installation. It is gone through and closed before the rest.
  const guideTarget = await browser.waitForTarget((t) => t.url().endsWith('/onboarding.html'), { timeout: 10000 });
  const guide = await guideTarget.page();
  guide.on('console', (m) => m.type() === 'error' && errors.push(`[guide] ${m.text()}`));
  guide.on('pageerror', (e) => errors.push(`[guide] ${e.message}`));
  await guide.waitForSelector('.onboarding-nav button.next');
  const guideStep = () => guide.$eval('main.step', (el) => `${el.className.replace('step step-', '')} (${document.querySelector('.step-count').textContent})`);
  const guideSteps = [await guideStep()];
  const providerSections = [];
  while (await guide.$('.onboarding-nav button.next')) {
    await guide.click('.onboarding-nav button.next');
    guideSteps.push(await guideStep());
    if (guideSteps.at(-1).startsWith('generator')) await guide.screenshot({ path: 'scripts/smoke-onboarding-generator.png', fullPage: true });
    providerSections.push(...(await guide.$$eval('#generator, #classifier', (els) => els.map((el) => el.id))));
  }
  console.log('Guide, steps with the AI:', guideSteps.join(' → '), '| provider sections:', providerSections.join(', '));
  await guide.waitForSelector('.levels em', { timeout: 5000 });
  console.log('Guide, summary:', await guide.$$eval('.levels li', (els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  await guide.screenshot({ path: 'scripts/smoke-onboarding.png', fullPage: true });
  // "Open the panel" calls sidePanel.open on click: the real side panel must open.
  await guide.click('.actions button:not(.secondary)');
  const sidePanel = await browser.waitForTarget((t) => t.url().endsWith('/sidepanel.html'), { timeout: 5000 }).catch(() => null);
  console.log('Guide, "Open the panel":', sidePanel ? `panel open (${sidePanel.type()})` : 'no panel');
  if (!sidePanel) throw new Error('"Open the panel" did not open the side panel');
  await (await sidePanel.asPage()).close();
  // "By site" shortens the guide: no provider steps.
  await guide.click('.onboarding-nav button.text');
  await guide.click('.onboarding-nav button.text');
  await guide.click('.onboarding-nav button.text');
  await guide.click('.mode:first-child');
  await guide.waitForFunction(() => /2\D+3/.test(document.querySelector('.step-count').textContent), { timeout: 5000 });
  console.log('Guide for site:', await guideStep());
  await guide.click('.onboarding-nav button.next');
  console.log('Guide for site, end:', await guideStep(), '|', await guide.$eval('.lead', (el) => el.textContent));
  await sw.evaluate(() => chrome.storage.sync.remove('mode'));
  await guide.close();

  // Shortcut to open the popup: registered by Chrome (on macOS it shows up as ⌥⇧G).
  const commands = await sw.evaluate(() => chrome.commands.getAll());
  const openPopup = commands.find((c) => c.name === '_execute_action');
  console.log('Shortcut:', JSON.stringify(openPopup));
  if (!openPopup?.shortcut) {
    throw new Error('Popup shortcut not registered');
  }

  const urls = [
    `http://localhost:${port}/a`,
    `http://127.0.0.1:${port}/b`,
    `http://localhost:${port}/c`,
    `http://127.0.0.1:${port}/d`,
    `http://localhost:${port}/e?segreto=1#frammento`,
  ];
  for (const url of urls) {
    const p = await browser.newPage();
    await p.goto(url);
  }
  const popup = await browser.newPage();
  popup.on('console', (m) => m.type() === 'error' && errors.push(`[popup] ${m.text()}`));
  popup.on('pageerror', (e) => errors.push(`[popup] ${e.message}`));
  await popup.goto(`chrome-extension://${extId}/sidepanel.html`);
  // On opening, the panel does not compute: it shows the window and waits for "Organize".
  await popup.waitForSelector('footer button.recompute', { timeout: 10000 });
  console.log('On opening, before Organize:', await popup.$eval('footer button.recompute', (el) => el.textContent), '| proposed groups:', (await popup.$$('.group:not(.existing)')).length);
  await popup.click('footer button.recompute');
  await popup.waitForSelector('.group:not(.existing)', { timeout: 10000 });
  const preview = await popup.$$eval('.group:not(.existing)', (els) =>
    els.map((el) => `${el.querySelector('.group-name').value} (${el.querySelector('.badge').textContent}): ${el.querySelectorAll('.tab').length} tab`),
  );
  console.log('Preview:', preview);
  const groupsBefore = await sw.evaluate(() => chrome.tabGroups.query({}));
  console.log('Groups before Apply:', groupsBefore.length);

  // Closing and reopening the popup: the proposal must still be there.
  await popup.reload();
  await popup.waitForSelector('.group:not(.existing)', { timeout: 10000 });
  console.log('Proposal after reopening:', (await popup.$$('.group:not(.existing)')).length, 'groups');

  // Editable preview: rename and color of the first group, one tab moved into the second.
  const nameInput = await popup.$('.group .group-name');
  await nameInput.evaluate((el) => el.select());
  await nameInput.type('Locale');
  await popup.keyboard.press('Enter');
  await popup.click('.group .swatch');
  await popup.click('.palette .color-purple');
  await popup.select('.group:nth-child(1) .tab:nth-child(1) .move select', 'p:g2');
  await popup.waitForFunction(() => document.querySelectorAll('.group:not(.existing):nth-child(2) .tab').length === 3, { timeout: 5000 });
  await popup.screenshot({ path: 'scripts/smoke-popup.png' });
  await popup.reload();
  await popup.waitForSelector('.group:not(.existing)');
  console.log('Preview edited after reopening:', await popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value}: ${el.querySelectorAll('.tab').length} tab`)));

  const order = () => sw.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).map((t) => `${t.title}${t.groupId > -1 ? '*' : ''}`));
  const orderBefore = await order();
  const buttons = await popup.$$('footer button');
  await buttons[buttons.length - 1].click();
  await popup.waitForFunction(() => !document.querySelector('.group:not(.existing)'), { timeout: 10000 });
  const groups = await sw.evaluate(async () => {
    const gs = await chrome.tabGroups.query({});
    return Promise.all(gs.map(async (g) => ({ title: g.title, color: g.color, tabs: (await chrome.tabs.query({ groupId: g.id })).map((t) => t.title) })));
  });
  console.log('Groups after Apply:', JSON.stringify(groups));
  // After "Apply" the panel still shows the whole window: the groups just created as existing groups.
  await popup.waitForFunction(() => document.querySelectorAll('.group.existing').length === 2, { timeout: 5000 });
  console.log('Panel sections after Apply:', await popup.$$eval('.section-header > h2, .section > summary', (els) => els.map((el) => el.textContent)));
  console.log('Order after Apply:', (await order()).join(' | '));

  await popup.waitForSelector('footer .undo', { timeout: 10000 });
  await popup.click('footer .undo');
  await popup.waitForFunction(() => !document.querySelector('footer .undo'), { timeout: 10000 });
  const orderAfterUndo = await order();
  const groupsAfterUndo = await sw.evaluate(() => chrome.tabGroups.query({}));
  console.log('After Undo:', orderAfterUndo.join(' | '));
  check('Undo restores order and groups', JSON.stringify(orderAfterUndo) === JSON.stringify(orderBefore) && groupsAfterUndo.length === 0);

  // Settings: minimum 3 tabs and exclusion of 127.0.0.1, then a new proposal.
  const options = await browser.newPage();
  options.on('pageerror', (e) => errors.push(`[options] ${e.message}`));
  // The settings are split into pages (#general, #categories, #ai, #about): the page is changed from the menu.
  const openView = async (view) => {
    await options.click(`.sidebar a[href="#${view}"]`);
    await options.waitForSelector(`.sidebar a[href="#${view}"][aria-current="page"]`);
  };
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.waitForSelector('#tabs input');
  // 800 px: menu as a bar at the top; 1280 px: side menu.
  console.log('Menu at 800 px:', await options.$$eval('.sidebar a', (els) => els.map((el) => `${el.textContent}${el.checkVisibility() ? '' : ' (hidden)'}`).join(', ')));
  await options.setViewport({ width: 1280, height: 800 });
  await options.screenshot({ path: 'scripts/smoke-options-wide.png' });
  await options.setViewport({ width: 800, height: 600 });
  await options.$eval('#min-tabs', (el) => el.select());
  await options.type('#min-tabs', '3');
  await options.type('#tabs input[type=text]', 'https://127.0.0.1/qualcosa');
  await options.click('#tabs button[type=submit]');
  await options.waitForSelector('.domains li');
  // Imports a backup (adds an excluded domain), then "Undo" removes it.
  const backupDir = mkdtempSync(path.join(tmpdir(), 'autogroup-smoke-'));
  const backupFile = path.join(backupDir, 'backup.json');
  writeFileSync(backupFile, JSON.stringify({ app: 'autoGroup', version: 1, settings: { minTabs: 3, excludedDomains: ['127.0.0.1', 'importato.it'] } }));
  await (await options.$('#backup input[type=file]')).uploadFile(backupFile);
  await options.waitForSelector('.snackbar button');
  const imported = (await sw.evaluate(() => chrome.storage.sync.get('excludedDomains'))).excludedDomains;
  await options.click('.snackbar button');
  await options.waitForFunction(() => !document.querySelector('.snackbar'), { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 200));
  const undone = (await sw.evaluate(() => chrome.storage.sync.get('excludedDomains'))).excludedDomains;
  rmSync(backupDir, { recursive: true });
  console.log('Import and undo: excluded domains', JSON.stringify(imported), '→', JSON.stringify(undone));
  if (!imported.includes('importato.it') || undone.includes('importato.it')) throw new Error('Import or "Undo" did not work');
  await openView('about');
  console.log('Coffee button:', await options.$eval('a.coffee', (el) => `${el.textContent} → ${el.href} (${el.target}) | visible: ${el.checkVisibility()}`));
  // The panel's link to a section opens the page that contains it.
  await options.evaluate(() => { location.hash = 'classifier'; });
  await options.waitForSelector('#classifier');
  console.log('Link #classifier: page', await options.$eval('.sidebar a[aria-current="page"]', (el) => el.getAttribute('href')));
  await openView('categories');
  // Categories: 10 default ones, rename, duplicate rejected, add, reorder, restore.
  const categoryNames = () => options.$$eval('.category-title', (els) => els.map((el) => el.textContent));
  console.log('Default categories:', (await categoryNames()).join(', '));
  const secondName = (await categoryNames())[1];
  // The rows are closed: the first one is opened to edit it.
  await options.click('.category:nth-child(1) .category-toggle');
  const firstName = await options.waitForSelector('.category-name');
  const retype = async (text) => {
    await firstName.click();
    await firstName.evaluate((el) => el.select());
    await options.keyboard.press('Backspace');
    await firstName.type(text);
  };
  await retype(` ${secondName.toUpperCase()} `);
  await options.$eval('.category-description', (el) => el.focus());
  console.log('Duplicate error:', await options.$eval('#categories .hint.error', (el) => el.textContent).catch(() => 'none'));
  await retype('Ufficio');
  await options.$eval('.category-description', (el) => el.focus());
  await options.click('#categories .actions button:not(.secondary)');
  await options.click('.category:nth-child(1) .category-actions button:nth-child(2)');
  await new Promise((r) => setTimeout(r, 200));
  const stored = await sw.evaluate(() => chrome.storage.sync.get('categories'));
  console.log('Categories saved:', stored.categories.map((c) => `${c.name}/${c.color}`).join(', '));
  await options.screenshot({ path: 'scripts/smoke-options.png', fullPage: true });
  // "Delete category" offers "Undo", which puts the category back with its sites.
  const firstId = await options.$eval('.category:first-child', (el) => el.dataset.category);
  await sw.evaluate((id) => chrome.storage.sync.set({ categorySites: { [id]: ['esempio.it'] } }), firstId);
  const countBefore = (await categoryNames()).length;
  await options.click('.category:last-child .delete-category');
  await options.waitForSelector('.snackbar button');
  const afterDelete = (await categoryNames()).length;
  await options.click('.snackbar button');
  await options.waitForFunction((n) => document.querySelectorAll('.category').length === n, { timeout: 5000 }, countBefore);
  // Deleting the last one does not touch the sites of the first; it is also tried with the first, which has some.
  await options.click('.category:first-child .category-toggle');
  await options.click('.category:first-child .delete-category');
  await options.waitForSelector('.snackbar button');
  const sitesAfterDelete = (await sw.evaluate(() => chrome.storage.sync.get('categorySites'))).categorySites;
  await options.click('.snackbar button');
  await options.waitForFunction((id) => document.querySelector('.category:first-child')?.dataset.category === id, { timeout: 5000 }, firstId);
  await new Promise((r) => setTimeout(r, 200));
  const sitesAfterUndo = (await sw.evaluate(() => chrome.storage.sync.get('categorySites'))).categorySites;
  console.log('Delete and undo: categories', countBefore, '→', afterDelete, '→', (await categoryNames()).length,
    '| sites of the first:', JSON.stringify(sitesAfterDelete), '→', JSON.stringify(sitesAfterUndo));
  if (afterDelete !== countBefore - 1 || sitesAfterUndo?.[firstId]?.[0] !== 'esempio.it') throw new Error('"Undo" did not restore the category');
  await options.click('#categories .actions button.secondary');
  await new Promise((r) => setTimeout(r, 200));
  console.log('Restore with "Undo" offered:', await options.$eval('.snackbar', (el) => el.textContent).catch(() => 'no'));
  console.log('After restore:', (await categoryNames()).length, 'categories,', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('categories'))));
  console.log('storage.sync:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get(['minTabs', 'excludedDomains']))));
  await popup.bringToFront();
  await popup.reload();
  await popup.waitForSelector('footer button');
  const recompute = await popup.$$('footer button.recompute');
  await recompute[0].click();
  await popup.waitForFunction(() => document.querySelectorAll('.group:not(.existing)').length > 0 || document.querySelector('.status'), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  console.log('Proposal with the settings:', await popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value}: ${el.querySelectorAll('.tab').length} tab`)));

  await options.bringToFront();
  await openView('ai');
  console.log('Gemini Nano:', await options.$eval('#generator .nano', (el) => el.textContent).catch(() => 'state not shown'),
    '| Prompt API in the service worker:', await sw.evaluate(() => typeof LanguageModel !== 'undefined'));

  // Generator: custom preset to the fake server, save, connection test.
  await options.bringToFront();
  await options.select('#generator select', 'custom');
  const fields = await options.$$('#generator input');
  await fields[0].type(`http://127.0.0.1:${port}/v1`);
  await fields[1].type('finto-modello');
  await fields[2].type('sk-smoke');
  await options.click('#generator .actions button:not(.secondary)');
  await options.waitForSelector('#generator .hint.ok, #generator .hint.error');
  console.log('Generator save:', await options.$eval('#generator .hint.ok, #generator .hint.error', (el) => el.textContent));
  await options.click('#generator .actions button.secondary');
  await options.waitForFunction(() => /successful|riuscita/.test(document.querySelector('#generator')?.textContent ?? ''), { timeout: 10000 });
  console.log('Connection test: successful');
  console.log('Key in local:', JSON.stringify(await sw.evaluate(() => chrome.storage.local.get(null))), '| in sync:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('generator'))));
  await options.screenshot({ path: 'scripts/smoke-options.png', fullPage: true });

  // Each "Recompute" starts with empty caches, so the real requests are visible; `keepCache` tests the cache.
  const repropose = async ({ keepCache = false } = {}) => {
    await popup.bringToFront();
    await popup.reload();
    await popup.waitForSelector('footer button');
    ai.requests.length = 0;
    if (!keepCache) await sw.evaluate(() => chrome.storage.session.remove(['classifierCache', 'descriptionCache']));
    await (await popup.$$('footer button.recompute'))[0].click();
    // Waits for the end of the computation (including any retry after a temporary error).
    await new Promise((r) => setTimeout(r, 200));
    await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 15000 });
    return popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value} (${el.querySelector('.badge').textContent}): ${el.querySelectorAll('.tab').length} tab`));
  };
  ai.requests.length = 0;
  console.log('Proposal from the Generator:', await repropose());
  console.log('Computation timings (ms):', JSON.stringify((await sw.evaluate(() => chrome.storage.session.get('organizer'))).organizer.proposal.timings));
  const sent = JSON.parse(ai.requests.at(-1).messages[1].content);
  // "Add to categories": right away the category mark and the waiting snackbar, then the outcome.
  await popup.click('.group .save');
  await popup.waitForSelector('.group .in-categories', { timeout: 2000 });
  await popup.waitForFunction(() => /categor/i.test(document.querySelector('.snackbar')?.textContent ?? '') && !document.querySelector('.snackbar').textContent.endsWith('…'), { timeout: 10000 });
  // The group becomes "list": the Organizer state says so, not the badge style.
  const isList = async () =>
    (await sw.evaluate(() => chrome.storage.session.get('organizer'))).organizer.proposal?.groups.some((g) => g.provenance === 'list');
  for (let i = 0; i < 50 && !(await isList()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await isList())) throw new Error('After "Add to categories" the group did not become "list"');
  console.log('Add to categories:', await popup.$eval('.snackbar', (el) => el.textContent), '| badge:', await popup.$eval('.group .badge', (el) => el.textContent));
  const savedCategory = (await sw.evaluate(() => chrome.storage.sync.get('categories'))).categories.at(-1);
  console.log('Saved category:', JSON.stringify({ name: savedCategory.name, description: savedCategory.description, color: savedCategory.color }));
  if (!savedCategory.description) throw new Error('"Add to categories" saved the category without the Generator description');
  if ((await sw.evaluate(() => chrome.storage.session.get('describingCategories'))).describingCategories?.length) {
    throw new Error('The category stayed "being described" after the Generator answered');
  }
  console.log('Tabs sent to the AI:', JSON.stringify(sent.tabs));
  check('Privacy (no query, fragment, 127.0.0.1 excluded)', !JSON.stringify(ai.requests).match(/segreto|frammento|127\.0\.0\.1:/));
  ai.fail = true;
  ai.requests.length = 0;
  console.log('Proposal with the Generator in error:', await repropose(), '| requests (with the retry):', ai.requests.length);
  console.log('Warning:', await popup.$eval('.warnings', (el) => el.textContent).catch(() => 'none'));
  await popup.screenshot({ path: 'scripts/smoke-popup-warning.png' });

  // Stop: the fake Generator does not answer, the user presses "Stop".
  ai.fail = false;
  ai.hang = true;
  await popup.reload();
  await popup.waitForSelector('footer button');
  await (await popup.$$('footer button.recompute'))[0].click();
  await popup.waitForSelector('.status.computing button.abort', { timeout: 10000 });
  await popup.click('.status.computing button.abort');
  await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 10000 });
  console.log('After Stop:', await popup.$eval('.content .banner', (el) => el.textContent).catch(() => 'no warning'), '| groups:', (await popup.$$('.group:not(.existing)')).length);

  // By-site preview: while the fake Generator does not answer, the panel already shows the groups by site;
  // "Use this" stops the AI and makes them the current proposal.
  await (await popup.$$('footer button.recompute'))[0].click();
  await popup.waitForSelector('.group.preview', { timeout: 10000 });
  console.log('Preview during computation:', await popup.$eval('.status.computing span', (el) => el.textContent), '|', await popup.$$eval('.group.preview', (els) => els.map((el) => `${el.querySelector('.group-name').textContent} (${el.querySelector('.badge').textContent}): ${el.querySelectorAll('.tab').length} tab`)), '| editable:', (await popup.$$('.group.preview input, .group.preview select')).length > 0);
  await popup.screenshot({ path: 'scripts/smoke-popup-preview.png' });
  await popup.click('.status.computing button.accept-preview');
  await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 10000 });
  console.log('After "Use this":', await popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value} (${el.querySelector('.badge').textContent})`)), '| Apply visible:', (await popup.$('footer button.apply')) !== null);
  ai.hang = false;

  // Page descriptions: switch on the AI page, then a new proposal.
  await options.bringToFront();
  await options.reload();
  await options.waitForSelector('#descriptions .toggle input:not([disabled])');
  await options.click('#descriptions .toggle input');
  await options.waitForFunction(() => document.querySelector('#descriptions .toggle input').checked, { timeout: 5000 });
  console.log('Descriptions on, in sync:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('readDescriptions'))));
  ai.requests.length = 0;
  await repropose();
  console.log('Tabs with description sent to the AI:', JSON.stringify(JSON.parse(ai.requests.at(-1).messages[1].content).tabs));
  await options.bringToFront();
  await options.click('#descriptions .toggle input');
  await options.waitForFunction(() => !document.querySelector('#descriptions .toggle input').checked, { timeout: 5000 });
  console.log('Descriptions off:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('readDescriptions'))));

  // Classifier: custom preset to the fake System One; the Generator stays in error.
  await options.bringToFront();
  await options.reload();
  await options.waitForSelector('#classifier select');
  await options.select('#classifier select', 'custom');
  const cfields = await options.$$('#classifier input[type=text]');
  await cfields[0].type(`http://127.0.0.1:${port}`);
  await options.click('#classifier .actions button:not(.secondary)');
  await options.waitForSelector('#classifier .hint.ok, #classifier .hint.error');
  console.log('Classifier save:', await options.$eval('#classifier .hint.ok, #classifier .hint.error', (el) => el.textContent));
  await options.click('#classifier .actions button.secondary');
  await options.waitForFunction(() => /successful|riuscita/.test(document.querySelector('#classifier')?.textContent ?? ''), { timeout: 10000 });
  console.log('Classifier connection test: successful');
  ai.requests.length = 0;
  console.log('Proposal from the Classifier:', await repropose());
  console.log('Requests: System One', ai.requests.filter((r) => r.systemone).length, '| Generator', ai.requests.filter((r) => !r.systemone).length);
  console.log('State sent to the Classifier:', JSON.stringify(ai.requests[0].systemone.state));
  check('Classifier privacy (no query, fragment, 127.0.0.1 excluded)', !JSON.stringify(ai.requests).match(/segreto|frammento|127\.0\.0\.1:/));
  const ids = await sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.id));
  check('No Chrome ID in the requests', !ids.some((id) => JSON.stringify(ai.requests).includes(`:${id},`) || JSON.stringify(ai.requests).includes(`"${id}"`)));
  console.log('Warnings:', await popup.$eval('.warnings', (el) => el.textContent).catch(() => 'none'));
  const cachedGroups = await repropose({ keepCache: true });
  const cachedRequests = ai.requests.filter((r) => r.systemone).length;
  console.log('Recompute with the cache:', cachedGroups, '| System One requests', cachedRequests);
  if (cachedRequests > 0) throw new Error('The Classifier cache was not used');

  // The four rows of the fallback table, with all the tabs (minimum 2, no excluded domain).
  // The providers are switched on and off directly in storage.sync: saving from the interface is already tested above.
  await sw.evaluate(() => chrome.storage.sync.set({ minTabs: 2, excludedDomains: [] }));
  const classifierOn = await sw.evaluate(async () => (await chrome.storage.sync.get('classifier')).classifier);
  const generatorOn = await sw.evaluate(async () => (await chrome.storage.sync.get('generator')).generator);
  const none = { preset: 'none', baseUrl: '', model: '' };
  const rows = [
    ['Classifier on, Generator on', classifierOn, generatorOn],
    ['Classifier on, Generator off', classifierOn, none],
    ['Classifier off, Generator on', none, generatorOn],
    ['Classifier off, Generator off', none, none],
  ];
  ai.unsure = true;
  for (const [label, classifier, generator] of rows) {
    await sw.evaluate((c, g) => chrome.storage.sync.set({ classifier: c, generator: g }), classifier, generator);
    ai.requests.length = 0;
    const groups = await repropose();
    const warnings = await popup.$eval('.warnings', (el) => el.textContent).catch(() => '');
    console.log(`${label}:`, JSON.stringify(groups), '| System One requests', ai.requests.filter((r) => r.systemone).length,
      '| Generator', ai.requests.filter((r) => !r.systemone).length, warnings ? `| warnings: ${warnings}` : '');
  }
  ai.unsure = false;

  // "By site" mode chosen from the interface: with both providers configured, no AI is queried.
  await sw.evaluate((c, g) => chrome.storage.sync.set({ classifier: c, generator: g }), classifierOn, generatorOn);
  await options.bringToFront();
  await options.reload();
  await openView('general');
  await options.waitForSelector('.mode');
  await options.click('.mode:first-child');
  // In the per-site mode the AI page stays in the menu but only shows how to turn the AI on.
  await openView('ai');
  await options.waitForFunction(() => !document.querySelector('#classifier') && document.querySelector('main .banner button'), { timeout: 5000 });
  console.log('Mode saved:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('mode'))));
  const domainOnly = await repropose();
  console.log('Site mode:', JSON.stringify(domainOnly), '| AI requests', ai.requests.length);
  if (ai.requests.length > 0 || domainOnly.some((g) => !g.includes('(site)'))) throw new Error('The per-site mode used the AI');

  // The panel selector: "With AI" saves the mode and recomputes with the providers.
  await popup.bringToFront();
  await popup.click('.segmented button[aria-checked="false"]');
  await popup.waitForFunction(() => document.querySelector('.segmented button[aria-checked="true"]')?.textContent?.includes('AI'), { timeout: 5000 });
  await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 15000 });
  console.log('Panel selector:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('mode'))), '| AI requests', ai.requests.length,
    '| summary:', await popup.$eval('.mode-summary', (el) => el.textContent));

  // Arrows between the tab rows: from the ✕ of the first row to the ✕ of the second.
  await popup.focus('.group:not(.existing) .tab .close-tab');
  await popup.keyboard.press('ArrowDown');
  const arrowTarget = await popup.evaluate(() => {
    const rows = [...document.querySelectorAll('.tab')].filter((r) => r.checkVisibility());
    return document.activeElement.classList.contains('close-tab') && rows.indexOf(document.activeElement.closest('.tab'));
  });
  console.log('Arrow down: focus on the ✕ of row', arrowTarget);
  if (arrowTarget !== 1) throw new Error('The arrows do not move the focus to the next row');

  // "Close tab" from the panel: the tab disappears from the window and from the proposal, without a stale proposal warning.
  const tabsBefore = await sw.evaluate(async () => (await chrome.tabs.query({})).length);
  const proposedBefore = await popup.$$eval('.group:not(.existing) .tab', (els) => els.length);
  await popup.hover('.group:not(.existing) .tab');
  await popup.click('.group:not(.existing) .tab .close-tab');
  await popup.waitForFunction((n) => document.querySelectorAll('.group:not(.existing) .tab').length === n - 1, { timeout: 5000 }, proposedBefore);
  await new Promise((r) => setTimeout(r, 300));
  const tabsAfter = await sw.evaluate(async () => (await chrome.tabs.query({})).length);
  const staleShown = (await popup.$('.banner.stale')) !== null;
  console.log('Close tab: tabs in the browser', tabsBefore, '→', tabsAfter, '| tabs in the proposal', proposedBefore, '→', proposedBefore - 1, '| stale proposal warning:', staleShown);
  if (tabsAfter !== tabsBefore - 1 || staleShown) throw new Error('"Close tab" did not work as expected');

  // Automatic grouping: a page of a site from the rules enters the group of its category
  // as soon as it opens; with the switch off it stays free.
  const category = (await sw.evaluate(() => chrome.storage.sync.get('categories'))).categories?.[0]
    ?? { id: 'work', name: 'Lavoro' };
  await sw.evaluate((id) => chrome.storage.sync.set({ minTabs: 1, categorySites: { [id]: ['127.0.0.1/auto'] } }), category.id);
  const groupOf = (path) => sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return tab && tab.groupId > -1 ? (await chrome.tabGroups.get(tab.groupId)).title : null;
  }, `http://127.0.0.1:${port}${path}`);
  const waitGroup = async (path) => {
    for (let i = 0; i < 20 && (await groupOf(path)) === null; i++) await new Promise((r) => setTimeout(r, 100));
    return groupOf(path);
  };
  await (await browser.newPage()).goto(`http://127.0.0.1:${port}/auto/1`);
  const autoOn = await waitGroup('/auto/1');
  await sw.evaluate(() => chrome.storage.sync.set({ autoGroupSites: false }));
  await (await browser.newPage()).goto(`http://127.0.0.1:${port}/auto/2`);
  await new Promise((r) => setTimeout(r, 500));
  const autoOff = await groupOf('/auto/2');
  console.log('Automatic grouping: on →', autoOn, '| off →', autoOff);
  if (autoOn !== category.name || autoOff !== null) throw new Error('Automatic grouping did not work as expected');
} finally {
  await browser.close();
  // Also closes the connections left hanging on purpose (the "Stop" test).
  server.closeAllConnections();
  server.close();
}
console.log(errors.length ? `Errors:\n${errors.join('\n')}` : 'No errors in console.');
// A console error counts as a failed check: CI must see it.
if (errors.length) process.exit(1);
