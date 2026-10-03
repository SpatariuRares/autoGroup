// Prova manuale automatizzata in Chrome for Testing: carica l'estensione da .output/chrome-mv3,
// apre alcune pagine, apre il popup come pagina e preme "Applica".
// Uso: npm run build && node scripts/smoke.mjs
import http from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer';

const extPath = path.resolve('.output/chrome-mv3');
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><title>Pagina ${req.url}</title><meta name="description" content="Descrizione ${req.url}"><h1>${req.url}</h1>`);
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
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'));
  const sw = await swTarget.worker();
  sw.on('console', (m) => m.type() === 'error' && errors.push(`[sw] ${m.text()}`));
  const extId = new URL(swTarget.url()).host;

  const urls = [
    `http://localhost:${port}/a`,
    `http://127.0.0.1:${port}/b`,
    `http://localhost:${port}/c`,
    `http://127.0.0.1:${port}/d`,
    `http://localhost:${port}/e`,
  ];
  for (const url of urls) {
    const p = await browser.newPage();
    await p.goto(url);
  }
  const popup = await browser.newPage();
  popup.on('console', (m) => m.type() === 'error' && errors.push(`[popup] ${m.text()}`));
  popup.on('pageerror', (e) => errors.push(`[popup] ${e.message}`));
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector('.group', { timeout: 10000 });
  const preview = await popup.$$eval('.group', (els) =>
    els.map((el) => `${el.querySelector('.group-name').value} (${el.querySelector('.badge').textContent}): ${el.querySelectorAll('.tab').length} tab`),
  );
  console.log('Anteprima:', preview);
  const groupsBefore = await sw.evaluate(() => chrome.tabGroups.query({}));
  console.log('Gruppi prima di Applica:', groupsBefore.length);

  // Chiudere e riaprire il popup: la proposta deve essere ancora lì.
  await popup.reload();
  await popup.waitForSelector('.group', { timeout: 10000 });
  console.log('Proposta dopo la riapertura:', (await popup.$$('.group')).length, 'gruppi');

  // Anteprima modificabile: rinomina e colore del primo gruppo, una tab spostata nel secondo.
  const nameInput = await popup.$('.group .group-name');
  await nameInput.evaluate((el) => el.select());
  await nameInput.type('Locale');
  await popup.keyboard.press('Enter');
  await popup.click('.group .swatch');
  await popup.click('.palette .color-purple');
  await popup.select('.group:nth-child(1) .tab:nth-child(1) .move', 'g2');
  await popup.waitForFunction(() => document.querySelectorAll('.group:nth-child(2) .tab').length === 3, { timeout: 5000 });
  await popup.screenshot({ path: 'scripts/smoke-popup.png' });
  await popup.reload();
  await popup.waitForSelector('.group');
  console.log('Anteprima modificata dopo la riapertura:', await popup.$$eval('.group', (els) => els.map((el) => `${el.querySelector('.group-name').value}: ${el.querySelectorAll('.tab').length} tab`)));

  const order = () => sw.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).map((t) => `${t.title}${t.groupId > -1 ? '*' : ''}`));
  const orderBefore = await order();
  const buttons = await popup.$$('footer button');
  await buttons[buttons.length - 1].click();
  await popup.waitForFunction(() => !document.querySelector('.group'), { timeout: 10000 });
  const groups = await sw.evaluate(async () => {
    const gs = await chrome.tabGroups.query({});
    return Promise.all(gs.map(async (g) => ({ title: g.title, color: g.color, tabs: (await chrome.tabs.query({ groupId: g.id })).map((t) => t.title) })));
  });
  console.log('Gruppi dopo Applica:', JSON.stringify(groups));
  console.log('Ordine dopo Applica:', (await order()).join(' | '));

  await popup.waitForSelector('footer .undo', { timeout: 10000 });
  await popup.click('footer .undo');
  await popup.waitForFunction(() => !document.querySelector('footer .undo'), { timeout: 10000 });
  const orderAfterUndo = await order();
  const groupsAfterUndo = await sw.evaluate(() => chrome.tabGroups.query({}));
  console.log('Dopo Annulla:', orderAfterUndo.join(' | '));
  console.log('Annulla ripristina ordine e gruppi:', JSON.stringify(orderAfterUndo) === JSON.stringify(orderBefore) && groupsAfterUndo.length === 0);

  // Impostazioni: minimo 3 tab ed esclusione di 127.0.0.1, poi una nuova proposta.
  const options = await browser.newPage();
  options.on('pageerror', (e) => errors.push(`[options] ${e.message}`));
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.waitForSelector('#behavior input');
  await options.$eval('#behavior input', (el) => el.select());
  await options.type('#behavior input', '3');
  await options.type('#privacy input', 'https://127.0.0.1/qualcosa');
  await options.click('#privacy button[type=submit]');
  await options.waitForSelector('.domains li');
  await options.screenshot({ path: 'scripts/smoke-options.png', fullPage: true });
  console.log('storage.sync:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get(null))));
  await popup.bringToFront();
  await popup.reload();
  await popup.waitForSelector('footer button');
  const recompute = await popup.$$('footer button.secondary:not(.undo)');
  await recompute[0].click();
  await popup.waitForFunction(() => document.querySelectorAll('.group').length > 0 || document.querySelector('.status'), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  console.log('Proposta con le impostazioni:', await popup.$$eval('.group', (els) => els.map((el) => `${el.querySelector('.group-name').value}: ${el.querySelectorAll('.tab').length} tab`)));
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? `Errori:\n${errors.join('\n')}` : 'Nessun errore in console.');
