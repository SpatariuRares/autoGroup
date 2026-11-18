// Check of the optional permissions with the normal build (no host permission pre-granted).
// In headless mode the Chrome window that asks for the permission cannot be accepted, so this checks
// that the click on "Save" and on the descriptions switch opens it (the request stays pending until
// the answer) instead of being refused right away, as happens to a request outside the user gesture.
// Usage: npm run build && node scripts/permissions-check.mjs
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
  console.log('Host permissions at startup:', JSON.stringify(await sw.evaluate(() => chrome.permissions.getAll().then((p) => p.origins))));

  const open = async () => {
    const page = await browser.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`[options] ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[options] ${e.message}`));
    await page.goto(`chrome-extension://${extId}/options.html`);
    await page.waitForSelector('#generator select');
    return page;
  };

  // Request outside the gesture (from the service worker, where there is never a gesture): Chrome refuses it right away.
  // It cannot be tried from a page: Puppeteer's page.evaluate simulates a user gesture.
  console.log('Request without a gesture:', await sw.evaluate(() =>
    chrome.permissions.request({ origins: ['https://example.com/*'] }).then((ok) => `risposta ${ok}`, (e) => `rifiutata: ${e.message}`)));

  // Click on "Save" in the Generator (Ollama): the request stays open, waiting for the user.
  const generator = await open();
  await generator.select('#generator select', 'ollama');
  await generator.click('#generator .actions button:not(.secondary)');
  await pause(1500);
  const hint = await generator.$eval('#generator .hint.ok, #generator .hint.error', (el) => el.textContent).catch(() => null);
  console.log('Save Generator: permission window open =', hint === null, hint ? `(result: ${hint})` : '');

  // Click on the descriptions switch: same thing for <all_urls>.
  const privacy = await open();
  await privacy.click('#privacy .toggle input');
  await pause(1500);
  const denied = await privacy.$eval('#privacy', (el) => /negato|denied/i.test(el.textContent));
  console.log('Descriptions switch: permission window open =', !denied);
} finally {
  await browser.close();
}
console.log(errors.length ? `Errors:\n${errors.join('\n')}` : 'No errors in console.');
