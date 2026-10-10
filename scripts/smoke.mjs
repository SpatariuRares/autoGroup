// Prova manuale automatizzata in Chrome for Testing: carica l'estensione da .output/chrome-mv3,
// apre alcune pagine, apre il pannello laterale come pagina e preme "Applica".
// Uso: npm run build && node scripts/smoke.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const extPath = path.resolve('.output/chrome-mv3');
// Finto Generatore compatibile OpenAI: mette tutte le tab in "Lettura Veloce", oppure risponde 500.
// Con `unsure` il finto System One risponde con confidenza bassa per le pagine /c e /d.
const ai = { fail: false, hang: false, unsure: false, requests: [] };
const server = http.createServer(async (req, res) => {
  if (req.url === '/v1/systemone') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    ai.requests.push({ systemone: request });
    res.setHeader('content-type', 'application/json');
    // Tutte le tab nella prima categoria, con confidenza alta.
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
    if (ai.hang) return; // nessuna risposta: si esce solo con il timeout o con "Interrompi"
    if (ai.fail) {
      res.statusCode = 500;
      return res.end('{}');
    }
    if (request.messages[0].content.includes('description of a category')) {
      return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Pagine da leggere con calma.' } }] }));
    }
    const tabs = request.messages.length > 1 ? JSON.parse(request.messages[1].content).tabs ?? [] : [];
    // Passo 2 della pipeline ("solo nuovi"): un nome diverso, per riconoscerlo nella proposta.
    const name = request.messages[0].content.includes('Do not reuse') ? 'Nuovo Tema' : 'Lettura Veloce';
    const content = JSON.stringify({ groups: [{ name, tabs: tabs.map((t) => t.id) }] });
    return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
  }
  res.setHeader('content-type', 'text/html');
  const path = req.url.split('?')[0];
  // La pagina /e ha la meta description vuota: si usa og:description.
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
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'));
  const sw = await swTarget.worker();
  sw.on('console', (m) => m.type() === 'error' && errors.push(`[sw] ${m.text()}`));
  const extId = new URL(swTarget.url()).host;

  // Guida al primo avvio: si apre da sola all'installazione. Si percorre e si chiude prima del resto.
  const guideTarget = await browser.waitForTarget((t) => t.url().endsWith('/onboarding.html'), { timeout: 10000 });
  const guide = await guideTarget.page();
  guide.on('console', (m) => m.type() === 'error' && errors.push(`[guida] ${m.text()}`));
  guide.on('pageerror', (e) => errors.push(`[guida] ${e.message}`));
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
  console.log('Guida, passi con l\'AI:', guideSteps.join(' → '), '| sezioni provider:', providerSections.join(', '));
  await guide.waitForSelector('.levels em', { timeout: 5000 });
  console.log('Guida, riepilogo:', await guide.$$eval('.levels li', (els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  await guide.screenshot({ path: 'scripts/smoke-onboarding.png', fullPage: true });
  // "Apri il pannello" chiama sidePanel.open nel clic: il pannello laterale vero deve aprirsi.
  await guide.click('.actions button:not(.secondary)');
  const sidePanel = await browser.waitForTarget((t) => t.url().endsWith('/sidepanel.html'), { timeout: 5000 }).catch(() => null);
  console.log('Guida, "Apri il pannello":', sidePanel ? `pannello aperto (${sidePanel.type()})` : 'nessun pannello');
  if (!sidePanel) throw new Error('"Apri il pannello" non ha aperto il pannello laterale');
  await (await sidePanel.asPage()).close();
  // "Per sito" accorcia la guida: niente passi dei provider.
  await guide.click('.onboarding-nav button.text');
  await guide.click('.onboarding-nav button.text');
  await guide.click('.onboarding-nav button.text');
  await guide.click('.mode:first-child');
  await guide.waitForFunction(() => /2\D+3/.test(document.querySelector('.step-count').textContent), { timeout: 5000 });
  console.log('Guida per sito:', await guideStep());
  await guide.click('.onboarding-nav button.next');
  console.log('Guida per sito, fine:', await guideStep(), '|', await guide.$eval('.lead', (el) => el.textContent));
  await sw.evaluate(() => chrome.storage.sync.remove('mode'));
  await guide.close();

  // Scorciatoia per aprire il popup: registrata da Chrome (su macOS appare come ⌥⇧G).
  const commands = await sw.evaluate(() => chrome.commands.getAll());
  const openPopup = commands.find((c) => c.name === '_execute_action');
  console.log('Scorciatoia:', JSON.stringify(openPopup));
  if (!openPopup?.shortcut) {
    throw new Error('Scorciatoia per il popup non registrata');
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
  await popup.waitForSelector('.group:not(.existing)', { timeout: 10000 });
  const preview = await popup.$$eval('.group:not(.existing)', (els) =>
    els.map((el) => `${el.querySelector('.group-name').value} (${el.querySelector('.badge').textContent}): ${el.querySelectorAll('.tab').length} tab`),
  );
  console.log('Anteprima:', preview);
  const groupsBefore = await sw.evaluate(() => chrome.tabGroups.query({}));
  console.log('Gruppi prima di Applica:', groupsBefore.length);

  // Chiudere e riaprire il popup: la proposta deve essere ancora lì.
  await popup.reload();
  await popup.waitForSelector('.group:not(.existing)', { timeout: 10000 });
  console.log('Proposta dopo la riapertura:', (await popup.$$('.group:not(.existing)')).length, 'gruppi');

  // Anteprima modificabile: rinomina e colore del primo gruppo, una tab spostata nel secondo.
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
  console.log('Anteprima modificata dopo la riapertura:', await popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value}: ${el.querySelectorAll('.tab').length} tab`)));

  const order = () => sw.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).map((t) => `${t.title}${t.groupId > -1 ? '*' : ''}`));
  const orderBefore = await order();
  const buttons = await popup.$$('footer button');
  await buttons[buttons.length - 1].click();
  await popup.waitForFunction(() => !document.querySelector('.group:not(.existing)'), { timeout: 10000 });
  const groups = await sw.evaluate(async () => {
    const gs = await chrome.tabGroups.query({});
    return Promise.all(gs.map(async (g) => ({ title: g.title, color: g.color, tabs: (await chrome.tabs.query({ groupId: g.id })).map((t) => t.title) })));
  });
  console.log('Gruppi dopo Applica:', JSON.stringify(groups));
  // Dopo "Applica" il pannello mostra comunque tutta la finestra: i gruppi appena creati come gruppi aperti.
  await popup.waitForFunction(() => document.querySelectorAll('.group.existing').length === 2, { timeout: 5000 });
  console.log('Sezioni del pannello dopo Applica:', await popup.$$eval('.section > h2, .section > summary', (els) => els.map((el) => el.textContent)));
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
  // Le impostazioni sono divise in pagine (#general, #categories, #ai, #about): si cambia pagina dal menu.
  const openView = async (view) => {
    await options.click(`.sidebar a[href="#${view}"]`);
    await options.waitForSelector(`.sidebar a[href="#${view}"][aria-current="page"]`);
  };
  await options.goto(`chrome-extension://${extId}/options.html`);
  await options.waitForSelector('#tabs input');
  // 800 px: menu come barra in alto; 1280 px: menu laterale.
  console.log('Menu a 800 px:', await options.$$eval('.sidebar a', (els) => els.map((el) => `${el.textContent}${el.checkVisibility() ? '' : ' (nascosta)'}`).join(', ')));
  await options.setViewport({ width: 1280, height: 800 });
  await options.screenshot({ path: 'scripts/smoke-options-wide.png' });
  await options.setViewport({ width: 800, height: 600 });
  await options.$eval('#min-tabs', (el) => el.select());
  await options.type('#min-tabs', '3');
  await options.type('#tabs input[type=text]', 'https://127.0.0.1/qualcosa');
  await options.click('#tabs button[type=submit]');
  await options.waitForSelector('.domains li');
  // Importa un backup (aggiunge un dominio escluso), poi "Annulla" lo toglie.
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
  console.log('Importa e annulla: domini esclusi', JSON.stringify(imported), '→', JSON.stringify(undone));
  if (!imported.includes('importato.it') || undone.includes('importato.it')) throw new Error('Import o "Annulla" non hanno funzionato');
  await openView('about');
  console.log('Pulsante caffè:', await options.$eval('a.coffee', (el) => `${el.textContent} → ${el.href} (${el.target}) | visibile: ${el.checkVisibility()}`));
  // Il link del pannello verso una sezione apre la pagina che la contiene.
  await options.evaluate(() => { location.hash = 'classifier'; });
  await options.waitForSelector('#classifier');
  console.log('Link #classifier: pagina', await options.$eval('.sidebar a[aria-current="page"]', (el) => el.getAttribute('href')));
  await openView('categories');
  // Categorie: 10 predefinite, rinomina, duplicato rifiutato, aggiunta, riordino, ripristino.
  const categoryNames = () => options.$$eval('.category-title', (els) => els.map((el) => el.textContent));
  console.log('Categorie predefinite:', (await categoryNames()).join(', '));
  const secondName = (await categoryNames())[1];
  // Le righe sono chiuse: si apre la prima per modificarla.
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
  console.log('Errore sul duplicato:', await options.$eval('#categories .hint.error', (el) => el.textContent).catch(() => 'nessuno'));
  await retype('Ufficio');
  await options.$eval('.category-description', (el) => el.focus());
  await options.click('#categories .actions button:not(.secondary)');
  await options.click('.category:nth-child(1) .category-actions button:nth-child(2)');
  await new Promise((r) => setTimeout(r, 200));
  const stored = await sw.evaluate(() => chrome.storage.sync.get('categories'));
  console.log('Categorie salvate:', stored.categories.map((c) => `${c.name}/${c.color}`).join(', '));
  await options.screenshot({ path: 'scripts/smoke-options.png', fullPage: true });
  // "Elimina categoria" offre "Annulla", che rimette la categoria con i suoi siti.
  const firstId = await options.$eval('.category:first-child', (el) => el.dataset.category);
  await sw.evaluate((id) => chrome.storage.sync.set({ categorySites: { [id]: ['esempio.it'] } }), firstId);
  const countBefore = (await categoryNames()).length;
  await options.click('.category:last-child .delete-category');
  await options.waitForSelector('.snackbar button');
  const afterDelete = (await categoryNames()).length;
  await options.click('.snackbar button');
  await options.waitForFunction((n) => document.querySelectorAll('.category').length === n, { timeout: 5000 }, countBefore);
  // Eliminare l'ultima non tocca i siti della prima; si prova anche con la prima, che ne ha.
  await options.click('.category:first-child .category-toggle');
  await options.click('.category:first-child .delete-category');
  await options.waitForSelector('.snackbar button');
  const sitesAfterDelete = (await sw.evaluate(() => chrome.storage.sync.get('categorySites'))).categorySites;
  await options.click('.snackbar button');
  await options.waitForFunction((id) => document.querySelector('.category:first-child')?.dataset.category === id, { timeout: 5000 }, firstId);
  await new Promise((r) => setTimeout(r, 200));
  const sitesAfterUndo = (await sw.evaluate(() => chrome.storage.sync.get('categorySites'))).categorySites;
  console.log('Elimina e annulla: categorie', countBefore, '→', afterDelete, '→', (await categoryNames()).length,
    '| siti della prima:', JSON.stringify(sitesAfterDelete), '→', JSON.stringify(sitesAfterUndo));
  if (afterDelete !== countBefore - 1 || sitesAfterUndo?.[firstId]?.[0] !== 'esempio.it') throw new Error('"Annulla" non ha rimesso la categoria');
  await options.click('#categories .actions button.secondary');
  await new Promise((r) => setTimeout(r, 200));
  console.log('Ripristino con "Annulla" offerto:', await options.$eval('.snackbar', (el) => el.textContent).catch(() => 'no'));
  console.log('Dopo il ripristino:', (await categoryNames()).length, 'categorie,', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('categories'))));
  console.log('storage.sync:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get(['minTabs', 'excludedDomains']))));
  await popup.bringToFront();
  await popup.reload();
  await popup.waitForSelector('footer button');
  const recompute = await popup.$$('footer button.secondary:not(.undo)');
  await recompute[0].click();
  await popup.waitForFunction(() => document.querySelectorAll('.group:not(.existing)').length > 0 || document.querySelector('.status'), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  console.log('Proposta con le impostazioni:', await popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value}: ${el.querySelectorAll('.tab').length} tab`)));

  await options.bringToFront();
  await openView('ai');
  console.log('Gemini Nano:', await options.$eval('#generator .nano', (el) => el.textContent).catch(() => 'stato non mostrato'),
    '| Prompt API nel service worker:', await sw.evaluate(() => typeof LanguageModel !== 'undefined'));

  // Generatore: preset personalizzato verso il finto server, salvataggio, prova connessione.
  await options.bringToFront();
  await options.select('#generator select', 'custom');
  const fields = await options.$$('#generator input');
  await fields[0].type(`http://127.0.0.1:${port}/v1`);
  await fields[1].type('finto-modello');
  await fields[2].type('sk-smoke');
  await options.click('#generator .actions button:not(.secondary)');
  await options.waitForSelector('#generator .hint.ok, #generator .hint.error');
  console.log('Salvataggio Generatore:', await options.$eval('#generator .hint.ok, #generator .hint.error', (el) => el.textContent));
  await options.click('#generator .actions button.secondary');
  await options.waitForFunction(() => /successful|riuscita/.test(document.querySelector('#generator')?.textContent ?? ''), { timeout: 10000 });
  console.log('Prova connessione: riuscita');
  console.log('Chiave in local:', JSON.stringify(await sw.evaluate(() => chrome.storage.local.get(null))), '| in sync:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('generator'))));
  await options.screenshot({ path: 'scripts/smoke-options.png', fullPage: true });

  // Ogni "Ricalcola" parte con le cache vuote, così si vedono le richieste vere; `keepCache` prova la cache.
  const repropose = async ({ keepCache = false } = {}) => {
    await popup.bringToFront();
    await popup.reload();
    await popup.waitForSelector('footer button');
    // All'apertura il popup calcola già una proposta se le impostazioni sono cambiate: si contano
    // solo le richieste del calcolo forzato da "Ricalcola".
    await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 15000 });
    ai.requests.length = 0;
    if (!keepCache) await sw.evaluate(() => chrome.storage.session.remove(['classifierCache', 'descriptionCache']));
    await (await popup.$$('footer button.secondary:not(.undo)'))[0].click();
    // Aspetta la fine del calcolo (con l'eventuale nuovo tentativo dopo un errore temporaneo).
    await new Promise((r) => setTimeout(r, 200));
    await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 15000 });
    return popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value} (${el.querySelector('.badge').textContent}): ${el.querySelectorAll('.tab').length} tab`));
  };
  ai.requests.length = 0;
  console.log('Proposta dal Generatore:', await repropose());
  console.log('Tempi del calcolo (ms):', JSON.stringify((await sw.evaluate(() => chrome.storage.session.get('organizer'))).organizer.proposal.timings));
  const sent = JSON.parse(ai.requests.at(-1).messages[1].content);
  await popup.click('.group .save');
  await popup.waitForFunction(() => /categor/i.test(document.querySelector('.snackbar')?.textContent ?? ''), { timeout: 10000 });
  console.log('Salva nella lista:', await popup.$eval('.snackbar', (el) => el.textContent), '| badge:', await popup.$eval('.group .badge', (el) => el.textContent));
  const savedCategory = (await sw.evaluate(() => chrome.storage.sync.get('categories'))).categories.at(-1);
  console.log('Categoria salvata:', JSON.stringify({ name: savedCategory.name, description: savedCategory.description, color: savedCategory.color }));
  console.log('Tab inviate all\'AI:', JSON.stringify(sent.tabs));
  console.log('Privacy (niente query, frammento, 127.0.0.1 escluso):', !JSON.stringify(ai.requests).match(/segreto|frammento|127\.0\.0\.1:/));
  ai.fail = true;
  ai.requests.length = 0;
  console.log('Proposta con il Generatore in errore:', await repropose(), '| richieste (con il nuovo tentativo):', ai.requests.length);
  console.log('Avviso:', await popup.$eval('.warnings', (el) => el.textContent).catch(() => 'nessuno'));
  await popup.screenshot({ path: 'scripts/smoke-popup-warning.png' });

  // Interrompi: il finto Generatore non risponde, l'utente preme "Interrompi".
  ai.fail = false;
  ai.hang = true;
  await popup.reload();
  await popup.waitForSelector('footer button');
  await (await popup.$$('footer button.secondary:not(.undo)'))[0].click();
  await popup.waitForSelector('.status.computing button.abort', { timeout: 10000 });
  await popup.click('.status.computing button.abort');
  await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 10000 });
  console.log('Dopo Interrompi:', await popup.$eval('.content .banner', (el) => el.textContent).catch(() => 'nessun avviso'), '| gruppi:', (await popup.$$('.group:not(.existing)')).length);

  // Anteprima per sito: mentre il finto Generatore non risponde il pannello mostra già i gruppi per sito;
  // "Usa questa" ferma l'AI e li rende la proposta corrente.
  await (await popup.$$('footer button.secondary:not(.undo)'))[0].click();
  await popup.waitForSelector('.group.preview', { timeout: 10000 });
  console.log('Anteprima durante il calcolo:', await popup.$eval('.status.computing span', (el) => el.textContent), '|', await popup.$$eval('.group.preview', (els) => els.map((el) => `${el.querySelector('.group-name').textContent} (${el.querySelector('.badge').textContent}): ${el.querySelectorAll('.tab').length} tab`)), '| modificabile:', (await popup.$$('.group.preview input, .group.preview select')).length > 0);
  await popup.screenshot({ path: 'scripts/smoke-popup-preview.png' });
  await popup.click('.status.computing button.accept-preview');
  await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 10000 });
  console.log('Dopo "Usa questa":', await popup.$$eval('.group:not(.existing)', (els) => els.map((el) => `${el.querySelector('.group-name').value} (${el.querySelector('.badge').textContent})`)), '| Applica visibile:', (await popup.$('footer button.apply')) !== null);
  ai.hang = false;

  // Descrizione delle pagine: interruttore nella pagina AI, poi una nuova proposta.
  await options.bringToFront();
  await options.reload();
  await options.waitForSelector('#descriptions .toggle input:not([disabled])');
  await options.click('#descriptions .toggle input');
  await options.waitForFunction(() => document.querySelector('#descriptions .toggle input').checked, { timeout: 5000 });
  console.log('Descrizioni attive in sync:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('readDescriptions'))));
  ai.requests.length = 0;
  await repropose();
  console.log('Tab con descrizione inviate all\'AI:', JSON.stringify(JSON.parse(ai.requests.at(-1).messages[1].content).tabs));
  await options.bringToFront();
  await options.click('#descriptions .toggle input');
  await options.waitForFunction(() => !document.querySelector('#descriptions .toggle input').checked, { timeout: 5000 });
  console.log('Descrizioni spente:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('readDescriptions'))));

  // Classificatore: preset personalizzato verso il finto System One; il Generatore resta in errore.
  await options.bringToFront();
  await options.reload();
  await options.waitForSelector('#classifier select');
  await options.select('#classifier select', 'custom');
  const cfields = await options.$$('#classifier input[type=text]');
  await cfields[0].type(`http://127.0.0.1:${port}`);
  await options.click('#classifier .actions button:not(.secondary)');
  await options.waitForSelector('#classifier .hint.ok, #classifier .hint.error');
  console.log('Salvataggio Classificatore:', await options.$eval('#classifier .hint.ok, #classifier .hint.error', (el) => el.textContent));
  await options.click('#classifier .actions button.secondary');
  await options.waitForFunction(() => /successful|riuscita/.test(document.querySelector('#classifier')?.textContent ?? ''), { timeout: 10000 });
  console.log('Prova connessione Classificatore: riuscita');
  ai.requests.length = 0;
  console.log('Proposta dal Classificatore:', await repropose());
  console.log('Richieste: System One', ai.requests.filter((r) => r.systemone).length, '| Generatore', ai.requests.filter((r) => !r.systemone).length);
  console.log('State inviato al Classificatore:', JSON.stringify(ai.requests[0].systemone.state));
  console.log('Privacy Classificatore (niente query, frammento, 127.0.0.1 escluso):', !JSON.stringify(ai.requests).match(/segreto|frammento|127\.0\.0\.1:/));
  const ids = await sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.id));
  console.log('Nessun ID di Chrome nelle richieste:', !ids.some((id) => JSON.stringify(ai.requests).includes(`:${id},`) || JSON.stringify(ai.requests).includes(`"${id}"`)));
  console.log('Avvisi:', await popup.$eval('.warnings', (el) => el.textContent).catch(() => 'nessuno'));
  const cachedGroups = await repropose({ keepCache: true });
  const cachedRequests = ai.requests.filter((r) => r.systemone).length;
  console.log('Ricalcola con la cache:', cachedGroups, '| richieste System One', cachedRequests);
  if (cachedRequests > 0) throw new Error('La cache del Classificatore non è stata usata');

  // Le quattro righe della tabella dei fallback, con tutte le tab (minimo 2, nessun dominio escluso).
  // I provider si accendono e spengono direttamente in storage.sync: il salvataggio dall'interfaccia è già provato sopra.
  await sw.evaluate(() => chrome.storage.sync.set({ minTabs: 2, excludedDomains: [] }));
  const classifierOn = await sw.evaluate(async () => (await chrome.storage.sync.get('classifier')).classifier);
  const generatorOn = await sw.evaluate(async () => (await chrome.storage.sync.get('generator')).generator);
  const none = { preset: 'none', baseUrl: '', model: '' };
  const rows = [
    ['Classificatore sì, Generatore sì', classifierOn, generatorOn],
    ['Classificatore sì, Generatore no', classifierOn, none],
    ['Classificatore no, Generatore sì', none, generatorOn],
    ['Classificatore no, Generatore no', none, none],
  ];
  ai.unsure = true;
  for (const [label, classifier, generator] of rows) {
    await sw.evaluate((c, g) => chrome.storage.sync.set({ classifier: c, generator: g }), classifier, generator);
    ai.requests.length = 0;
    const groups = await repropose();
    const warnings = await popup.$eval('.warnings', (el) => el.textContent).catch(() => '');
    console.log(`${label}:`, JSON.stringify(groups), '| richieste System One', ai.requests.filter((r) => r.systemone).length,
      '| Generatore', ai.requests.filter((r) => !r.systemone).length, warnings ? `| avvisi: ${warnings}` : '');
  }
  ai.unsure = false;

  // Modalità "Per sito" scelta dall'interfaccia: con entrambi i provider configurati nessuna AI viene interrogata.
  await sw.evaluate((c, g) => chrome.storage.sync.set({ classifier: c, generator: g }), classifierOn, generatorOn);
  await options.bringToFront();
  await options.reload();
  await openView('general');
  await options.waitForSelector('.mode');
  await options.click('.mode:first-child');
  // Nella modalità per sito la pagina AI resta nel menu ma mostra solo come accendere l'AI.
  await openView('ai');
  await options.waitForFunction(() => !document.querySelector('#classifier') && document.querySelector('main .banner button'), { timeout: 5000 });
  console.log('Modalità salvata:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('mode'))));
  const domainOnly = await repropose();
  console.log('Modalità per sito:', JSON.stringify(domainOnly), '| richieste AI', ai.requests.length);
  if (ai.requests.length > 0 || domainOnly.some((g) => !g.includes('(site)'))) throw new Error('La modalità per sito ha usato l\'AI');

  // Il selettore del pannello: "Con l'AI" salva la modalità e ricalcola con i provider.
  await popup.bringToFront();
  await popup.click('.segmented button[aria-checked="false"]');
  await popup.waitForFunction(() => document.querySelector('.segmented button[aria-checked="true"]')?.textContent?.includes('AI'), { timeout: 5000 });
  await popup.waitForFunction(() => !document.querySelector('.status.computing'), { timeout: 15000 });
  console.log('Selettore del pannello:', JSON.stringify(await sw.evaluate(() => chrome.storage.sync.get('mode'))), '| richieste AI', ai.requests.length,
    '| riepilogo:', await popup.$eval('.mode-summary', (el) => el.textContent));

  // Frecce tra le righe delle tab: dal ✕ della prima riga al ✕ della seconda.
  await popup.focus('.group:not(.existing) .tab .close-tab');
  await popup.keyboard.press('ArrowDown');
  const arrowTarget = await popup.evaluate(() => {
    const rows = [...document.querySelectorAll('.tab')].filter((r) => r.checkVisibility());
    return document.activeElement.classList.contains('close-tab') && rows.indexOf(document.activeElement.closest('.tab'));
  });
  console.log('Freccia giù: focus sul ✕ della riga', arrowTarget);
  if (arrowTarget !== 1) throw new Error('Le frecce non spostano il focus alla riga successiva');

  // "Chiudi la tab" dal pannello: la tab sparisce dalla finestra e dalla proposta, senza avviso di proposta superata.
  const tabsBefore = await sw.evaluate(async () => (await chrome.tabs.query({})).length);
  const proposedBefore = await popup.$$eval('.group:not(.existing) .tab', (els) => els.length);
  await popup.hover('.group:not(.existing) .tab');
  await popup.click('.group:not(.existing) .tab .close-tab');
  await popup.waitForFunction((n) => document.querySelectorAll('.group:not(.existing) .tab').length === n - 1, { timeout: 5000 }, proposedBefore);
  await new Promise((r) => setTimeout(r, 300));
  const tabsAfter = await sw.evaluate(async () => (await chrome.tabs.query({})).length);
  const staleShown = (await popup.$('.banner.stale')) !== null;
  console.log('Chiudi tab: tab nel browser', tabsBefore, '→', tabsAfter, '| tab nella proposta', proposedBefore, '→', proposedBefore - 1, '| avviso di proposta superata:', staleShown);
  if (tabsAfter !== tabsBefore - 1 || staleShown) throw new Error('"Chiudi la tab" non ha funzionato come previsto');

  // Raggruppamento automatico: una pagina di un sito delle regole entra nel gruppo della sua categoria
  // appena apre; con l'interruttore spento resta libera.
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
  console.log('Raggruppamento automatico: acceso →', autoOn, '| spento →', autoOff);
  if (autoOn !== category.name || autoOff !== null) throw new Error('Il raggruppamento automatico non ha funzionato come previsto');
} finally {
  await browser.close();
  // Chiude anche le connessioni lasciate appese apposta (prova di "Interrompi").
  server.closeAllConnections();
  server.close();
}
console.log(errors.length ? `Errori:\n${errors.join('\n')}` : 'Nessun errore in console.');
