// Prova del drag and drop del pannello con il mouse vero in Chrome for Testing: il trascinamento
// nativo lo fa Chrome, e i test con il browser finto non lo vedono. In particolare Chrome annulla un
// trascinamento se la riga trascinata si sposta appena parte (es. per un elemento che compare sopra
// di lei): così le tab senza gruppo non si trascinavano più quando la zona "Nuovo gruppo" stava sopra.
// Esce con codice 1 se un caso fallisce.
// Uso: npm run build && node scripts/drag-check.mjs
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

  // Un gruppo aperto ("Lavoro") e due tab senza gruppo.
  for (const p of ['/lavoro', '/libera-1', '/libera-2']) await (await browser.newPage()).goto(`http://localhost:${port}${p}`);
  const panel = await browser.newPage();
  panel.on('console', (m) => m.type() === 'error' && errors.push(`[pannello] ${m.text()}`));
  panel.on('pageerror', (e) => errors.push(`[pannello] ${e.message}`));
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://localhost/lavoro' });
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, { title: 'Lavoro', color: 'blue' });
  });
  await panel.waitForSelector('.group.existing');

  /** Il gruppo di ogni tab, per percorso: "Lavoro", "localhost" o "-" se senza gruppo. */
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
  // Trascina col mouse: preme sulla riga, si muove un poco perché il trascinamento parta (e compaia
  // ciò che compare solo durante il trascinamento), poi cerca il bersaglio e ci lascia la tab.
  const drag = async (rowSelector, targetSelector) => {
    const from = await center(rowSelector);
    await panel.mouse.move(from.x, from.y);
    await panel.mouse.down();
    await panel.mouse.move(from.x + 5, from.y + 5, { steps: 5 });
    await pause(200);
    const to = await center(targetSelector).catch(() => null);
    if (to) {
      // A piccoli passi e con una pausa sopra il bersaglio: Chrome lascia la tab solo dove ha appena
      // mandato un dragover accettato, e un mouse troppo veloce rilascia prima che arrivi.
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

  // Una tab senza gruppo sulla scheda di un gruppo aperto: entra nel gruppo.
  await drag(row('/libera-1'), '.group.existing');
  const afterGroup = await strip();
  check('tab senza gruppo → gruppo aperto', afterGroup['/libera-1'] === 'Lavoro', afterGroup);

  // Una tab senza gruppo sulla zona "Nuovo gruppo": nasce un gruppo col nome del sito.
  const zoneSeen = await drag(row('/libera-2'), '.new-group-drop');
  const afterNew = await strip();
  check('tab senza gruppo → nuovo gruppo', zoneSeen && afterNew['/libera-2'] === 'localhost', { zona: zoneSeen, ...afterNew });

  // Una tab di un gruppo aperto sulla zona "Nuovo gruppo".
  await panel.click('.group.existing .group-toggle[aria-expanded="false"]').catch(() => {});
  const lavoro = await drag(row('/lavoro'), '.new-group-drop');
  const afterGrouped = await strip();
  check('tab di un gruppo aperto → nuovo gruppo', lavoro && afterGrouped['/lavoro'] === 'localhost', { zona: lavoro, ...afterGrouped });
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? `Errori:\n${errors.join('\n')}` : 'Nessun errore in console.');
if (failures.length) process.exit(1);
