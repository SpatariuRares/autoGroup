// Drag and drop check of the side panel with the real mouse in Chrome for Testing: the native drag
// is done by Chrome, and tests with the fake browser don't see it. In particular Chrome cancels a
// drag if the dragged row moves right after it starts (e.g. for an element that appears above it):
// so free tabs stopped being draggable when the "New group" zone was above them.
// Exits with code 1 if a case fails.
// Usage: npm run build && node scripts/drag-check.mjs
import http from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer';

const extPath = path.resolve('.output/chrome-mv3');
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><title>Pagina ${req.url}</title><h1>${req.url}</h1>`);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [extPath], args: ['--lang=it'] });
const errors = [];
const failures = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'));
  const sw = await swTarget.worker();
  sw.on('console', (m) => m.type() === 'error' && errors.push(`[sw] ${m.text()}`));
  const extId = new URL(swTarget.url()).host;

  // One existing group ("Lavoro") and two free tabs.
  for (const p of ['/lavoro', '/libera-1', '/libera-2']) await (await browser.newPage()).goto(`http://localhost:${port}${p}`);
  const panel = await browser.newPage();
  panel.on('console', (m) => m.type() === 'error' && errors.push(`[panel] ${m.text()}`));
  panel.on('pageerror', (e) => errors.push(`[panel] ${e.message}`));
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://localhost/lavoro' });
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, { title: 'Lavoro', color: 'blue' });
  });
  await panel.waitForSelector('.group.existing');

  /** The group of each tab, by path: "Lavoro", "localhost" or "-" if it has no group. */
  const strip = () =>
    panel.evaluate(async () => {
      const groups = new Map((await chrome.tabGroups.query({})).map((g) => [g.id, g.title]));
      const tabs = await chrome.tabs.query({ url: '*://localhost/*' });
      return Object.fromEntries(tabs.map((t) => [new URL(t.url).pathname, groups.get(t.groupId) ?? '-']));
    });
  const center = async (selector) => {
    const box = await (await panel.waitForSelector(selector, { timeout: 2000 })).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  // Drags with the mouse: presses on the row, moves a little so the drag starts (and whatever only
  // appears during a drag shows up), then looks for the target and drops the tab there.
  const drag = async (rowSelector, targetSelector) => {
    const from = await center(rowSelector);
    await panel.mouse.move(from.x, from.y);
    await panel.mouse.down();
    await panel.mouse.move(from.x + 5, from.y + 5, { steps: 5 });
    await pause(200);
    const to = await center(targetSelector).catch(() => null);
    if (to) {
      // In small steps and with a pause over the target: Chrome drops the tab only where it has just
      // sent an accepted dragover, and a mouse that is too fast releases before it gets there.
      for (let i = 1; i <= 10; i++) {
        await panel.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
        await pause(30);
      }
      await panel.mouse.move(to.x, to.y + 1);
      await pause(150);
    }
    await panel.mouse.up();
    await pause(800);
    return to !== null;
  };
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`);
    if (!ok) failures.push(name);
  };

  const row = (p) => `li.tab[title$="${p}"]`;

  // A free tab dropped on the tab strip of an existing group: it joins the group.
  await drag(row('/libera-1'), '.group.existing');
  const afterGroup = await strip();
  check('free tab → existing group', afterGroup['/libera-1'] === 'Lavoro', afterGroup);

  // A free tab dropped on the "New group" zone: a group named after the site is created.
  const zoneSeen = await drag(row('/libera-2'), '.new-group-drop');
  const afterNew = await strip();
  check('free tab → new group', zoneSeen && afterNew['/libera-2'] === 'localhost', { zone: zoneSeen, ...afterNew });

  // A tab of an existing group dropped on the "New group" zone.
  await panel.click('.group.existing .group-toggle[aria-expanded="false"]').catch(() => {});
  const lavoro = await drag(row('/lavoro'), '.new-group-drop');
  const afterGrouped = await strip();
  check('tab of an existing group → new group', lavoro && afterGrouped['/lavoro'] === 'localhost', { zone: lavoro, ...afterGrouped });
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? `Errors:\n${errors.join('\n')}` : 'No errors in console.');
if (failures.length) process.exit(1);
