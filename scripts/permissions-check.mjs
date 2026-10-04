// Prova dei permessi opzionali con la build normale (nessun permesso host pre-concesso).
// In headless la finestra di Chrome che chiede il permesso non si può accettare, quindi si verifica
// che il clic su "Salva" e sull'interruttore delle descrizioni la apra (la richiesta resta in attesa
// della risposta) invece di essere rifiutata subito, come succede a una richiesta fuori dal gesto.
// Uso: npm run build && node scripts/permissions-check.mjs
import path from 'node:path';
import puppeteer from 'puppeteer';

const extPath = path.resolve('.output/chrome-mv3');
const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [extPath], args: ['--lang=it'] });
const errors = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'));
  const sw = await swTarget.worker();
  sw.on('console', (m) => m.type() === 'error' && errors.push(`[sw] ${m.text()}`));
  const extId = new URL(swTarget.url()).host;
  console.log('Permessi host all\'avvio:', JSON.stringify(await sw.evaluate(() => chrome.permissions.getAll().then((p) => p.origins))));

  const open = async () => {
    const page = await browser.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`[options] ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[options] ${e.message}`));
    await page.goto(`chrome-extension://${extId}/options.html`);
    await page.waitForSelector('#generator select');
    return page;
  };

  // Richiesta fuori dal gesto (dal service worker, dove un gesto non c'è mai): Chrome la rifiuta subito.
  // Da una pagina non si può provare: page.evaluate di Puppeteer simula un gesto dell'utente.
  console.log('Richiesta senza gesto:', await sw.evaluate(() =>
    chrome.permissions.request({ origins: ['https://example.com/*'] }).then((ok) => `risposta ${ok}`, (e) => `rifiutata: ${e.message}`)));

  // Clic su "Salva" del Generatore (Ollama): la richiesta resta aperta in attesa dell'utente.
  const generator = await open();
  await generator.select('#generator select', 'ollama');
  await generator.click('#generator .actions button:not(.secondary)');
  await pause(1500);
  const hint = await generator.$eval('#generator .hint.ok, #generator .hint.error', (el) => el.textContent).catch(() => null);
  console.log('Salva Generatore: finestra di permesso aperta =', hint === null, hint ? `(esito: ${hint})` : '');

  // Clic sull'interruttore delle descrizioni: stessa cosa per <all_urls>.
  const privacy = await open();
  await privacy.click('#privacy .toggle input');
  await pause(1500);
  const denied = await privacy.$eval('#privacy', (el) => /negato|denied/i.test(el.textContent));
  console.log('Interruttore descrizioni: finestra di permesso aperta =', !denied);
} finally {
  await browser.close();
}
console.log(errors.length ? `Errori:\n${errors.join('\n')}` : 'Nessun errore in console.');
