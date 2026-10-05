// Immagini per la scheda del Chrome Web Store, in italiano e in inglese: 4 screenshot 1280×800 e la
// tile promozionale piccola 440×280, in docs/store/<lingua>/; più l'icona dello store (128×128 con il
// disegno in 96×96 e 16 px di margine trasparente, come chiedono le linee guida) in docs/store/icon-128.png.
// Le tab sono pagine servite in locale con titoli realistici: --host-resolver-rules manda ogni host
// (github.com, bbc.com, …) a questo server, quindi indirizzi e favicon sembrano quelli veri senza
// uscire dal computer. Il server è HTTPS con un certificato temporaneo (molti domini sono nella lista
// HSTS di Chrome, che forza HTTPS), accettato solo da questo Chrome di prova. Il Generatore è finto e risponde sempre allo stesso modo, così le immagini sono
// riproducibili. Serve la build di prova, che concede in anticipo i permessi host:
//   npm run store-assets
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const extPath = path.resolve('.output/chrome-mv3');
const AI_HOST = 'ai.autogroup.test';

/** Tab della finestra di esempio: host, percorso, titolo, colore e lettera della favicon. */
const TABS = [
  ['github.com', '/acme/web/pull/42', { it: 'Correzione del redirect dopo il login · Pull Request #42 · acme/web', en: 'Fix redirect after login · Pull Request #42 · acme/web' }, '#24292f', 'G'],
  ['stackoverflow.com', '/questions/42', { it: 'Come fare il debounce di un input in React? - Stack Overflow', en: 'How to debounce an input in React? - Stack Overflow' }, '#f48024', 'S'],
  ['www.bbc.com', '/news', { it: 'BBC News - Home', en: 'BBC News - Home' }, '#bb1919', 'B'],
  ['www.booking.com', '/hotel/pt/lisboa', { it: 'Hotel a Lisbona – Booking.com', en: 'Hotels in Lisbon – Booking.com' }, '#003580', 'B'],
  ['www.giallozafferano.it', '/ricetta/carbonara', { it: 'Spaghetti alla carbonara - Ricetta', en: 'Spaghetti carbonara - Recipe' }, '#e2001a', 'Z'],
  ['developer.mozilla.org', '/docs/Web/JavaScript/Reference/Global_Objects/Array/map', { it: 'Array.prototype.map() - JavaScript | MDN', en: 'Array.prototype.map() - JavaScript | MDN' }, '#000000', 'M'],
  ['www.youtube.com', '/watch', { it: 'Musica lo-fi per studiare - YouTube', en: 'Lo-fi music to study to - YouTube' }, '#ff0000', 'Y'],
  ['www.theguardian.com', '/world', { it: 'World news | The Guardian', en: 'World news | The Guardian' }, '#052962', 'G'],
  ['www.skyscanner.it', '/voli/lisbona', { it: 'Voli per Lisbona | Skyscanner', en: 'Flights to Lisbon | Skyscanner' }, '#0770e3', 'S'],
  ['www.giallozafferano.it', '/ricetta/tiramisu', { it: 'Tiramisù classico - Ricetta', en: 'Classic tiramisù - Recipe' }, '#e2001a', 'Z'],
  ['open.spotify.com', '/playlist/focus', { it: 'Concentrazione profonda – Spotify', en: 'Deep Focus – Spotify' }, '#1db954', 'S'],
  ['acme.atlassian.net', '/browse/PROJ-128', { it: 'PROJ-128 Login lento su mobile – Jira', en: 'PROJ-128 Slow login on mobile – Jira' }, '#0052cc', 'J'],
  ['www.amazon.it', '/cuffie', { it: 'Cuffie wireless con cancellazione del rumore', en: 'Noise-cancelling wireless headphones' }, '#ff9900', 'A'],
];
/** Tab già in un gruppo aperto ("Progetto X"), che la proposta estende con la tab di Jira. */
const GROUPED = ['acme.atlassian.net', '/jira/board', { it: 'Sprint 14 – Jira', en: 'Sprint 14 – Jira' }, '#0052cc', 'J'];

/** Gruppi del Generatore finto per host: nomi delle categorie predefinite nella lingua, più un gruppo nuovo. */
const GROUPS = {
  it: { Sviluppo: ['github.com', 'stackoverflow.com', 'developer.mozilla.org'], Notizie: ['www.bbc.com', 'www.theguardian.com'], Viaggi: ['www.booking.com', 'www.skyscanner.it'], Video: ['www.youtube.com', 'open.spotify.com'], Ricette: ['www.giallozafferano.it'], 'Progetto X': ['acme.atlassian.net'] },
  en: { Dev: ['github.com', 'stackoverflow.com', 'developer.mozilla.org'], News: ['www.bbc.com', 'www.theguardian.com'], Travel: ['www.booking.com', 'www.skyscanner.it'], Video: ['www.youtube.com', 'open.spotify.com'], Recipes: ['www.giallozafferano.it'], 'Project X': ['acme.atlassian.net'] },
};

/** Testi delle immagini: titolo e sottotitolo di ogni screenshot, tile promozionale. */
const COPY = {
  it: {
    shots: [
      ['Le tab in ordine, per argomento', 'Controlli e modifichi i gruppi proposti. Niente si muove finché non premi «Applica».'],
      ['Subito una proposta, mentre l\'AI pensa', 'I gruppi per sito arrivano all\'istante. «Usa questa» per non aspettare.'],
      ['L\'AI la scegli tu', 'Gemini Nano nel browser, un server locale o un servizio online.'],
      ['Le tue categorie', 'Nomi, colori e descrizioni che l\'AI usa per ordinare le tab.'],
    ],
    tagline: 'Le tab in gruppi, con l\'AI che scegli tu',
    group: 'Progetto X',
  },
  en: {
    shots: [
      ['Your tabs, sorted by topic', 'Review and edit the suggested groups. Nothing moves until you press “Apply”.'],
      ['A proposal right away, while the AI thinks', 'Groups by site arrive instantly. “Use this” if you don\'t want to wait.'],
      ['You choose the AI', 'Gemini Nano in the browser, a local server or an online service.'],
      ['Your categories', 'Names, colors and descriptions the AI uses to sort your tabs.'],
    ],
    tagline: 'Group your tabs with the AI you choose',
    group: 'Project X',
  },
};

const ai = { locale: 'it', hang: false };
const pending = new Set();
const certDir = mkdtempSync(path.join(tmpdir(), 'autogroup-store-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=autogroup.test',
  '-keyout', path.join(certDir, 'key.pem'), '-out', path.join(certDir, 'cert.pem')], { stdio: 'ignore' });
const tls = { key: readFileSync(path.join(certDir, 'key.pem')), cert: readFileSync(path.join(certDir, 'cert.pem')) };
rmSync(certDir, { recursive: true });

const server = https.createServer(tls, async (req, res) => {
  const host = (req.headers.host ?? '').split(':')[0];
  if (host === AI_HOST) {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (ai.hang) return pending.add(res);
    const request = JSON.parse(body);
    const tabs = JSON.parse(request.messages[1].content).tabs ?? [];
    const groups = Object.entries(GROUPS[ai.locale])
      .map(([name, hosts]) => ({ name, tabs: tabs.filter((t) => hosts.some((h) => t.url.startsWith(h))).map((t) => t.id) }))
      .filter((g) => g.tabs.length > 0);
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ groups }) } }] }));
  }
  const tab = [...TABS, GROUPED].find(([h, p]) => h === host && (req.url === p || req.url === '/favicon.svg'));
  if (req.url === '/favicon.svg') {
    const [, , , color, letter] = tab ?? TABS[0];
    res.setHeader('content-type', 'image/svg+xml');
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${color}"/><text x="16" y="22.5" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`);
  }
  const title = tab ? tab[2][ai.locale] : 'autoGroup';
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><link rel="icon" href="/favicon.svg"><h1>${title}</h1>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const icon = `data:image/png;base64,${readFileSync('public/icon/128.png').toString('base64')}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Schermata 1280×800: titolo e sottotitolo a sinistra, l'immagine dell'interfaccia a destra. */
function frame(png, [title, subtitle], wide) {
  const image = `data:image/png;base64,${png.toString('base64')}`;
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; width: 1280px; height: 800px; display: flex; align-items: center; gap: 56px; padding: 0 72px; box-sizing: border-box;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #e8f0fe 0%, #d2e3fc 55%, #c2d7fa 100%); color: #1f1f1f; }
    .copy { flex: ${wide ? '0 0 330px' : '1'}; }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; color: #0b57d0; margin-bottom: 28px; }
    .brand img { width: 40px; height: 40px; }
    h1 { font-size: ${wide ? 40 : 48}px; line-height: 1.12; margin: 0 0 20px; font-weight: 650; letter-spacing: -0.5px; }
    p { font-size: ${wide ? 21 : 24}px; line-height: 1.4; margin: 0; color: #444746; }
    .shot { flex: none; max-height: 720px; max-width: ${wide ? 760 : 440}px; border-radius: 16px; box-shadow: 0 12px 40px rgba(11, 87, 208, 0.25), 0 2px 8px rgba(0,0,0,0.12); }
  </style><div class="copy"><div class="brand"><img src="${icon}">autoGroup</div><h1>${title}</h1><p>${subtitle}</p></div><img class="shot" src="${image}">`;
}

/** Tile promozionale piccola 440×280. */
function tile(tagline) {
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0b57d0, #4285f4); color: #fff; text-align: center; }
    img { width: 88px; height: 88px; background: #fff; border-radius: 22px; padding: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
    h1 { margin: 0; font-size: 34px; font-weight: 700; }
    p { margin: 0 32px; font-size: 18px; line-height: 1.3; opacity: 0.95; }
  </style><img src="${icon}"><h1>autoGroup</h1><p>${tagline}</p>`;
}

async function render(browser, html, width, height, file, transparent = false) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: file, omitBackground: transparent });
  await page.close();
}

/** Icona dello store: l'icona dell'estensione ridotta a 96×96, al centro di 128×128 trasparenti. */
const storeIcon = `<!doctype html><style>html, body { margin: 0; background: transparent; } img { display: block; width: 96px; height: 96px; margin: 16px; }</style><img src="${icon}">`;

for (const locale of ['it', 'en']) {
  ai.locale = locale;
  ai.hang = false;
  const out = `docs/store/${locale}`;
  mkdirSync(out, { recursive: true });
  const copy = COPY[locale];
  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    enableExtensions: [extPath],
    // -AppleLanguages sceglie la lingua dell'interfaccia di Chrome su macOS; --lang negli altri sistemi.
    args: [`--lang=${locale}`, '-AppleLanguages', `(${locale})`, `--host-resolver-rules=MAP * 127.0.0.1:${port}`, '--ignore-certificate-errors'],
  });
  try {
    const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'));
    const sw = await swTarget.worker();
    const extId = new URL(swTarget.url()).host;
    const light = (page) => page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    // Su macOS Chrome apre come pagina anche l'argomento "(it)" di -AppleLanguages: si chiude.
    await sw.evaluate(async () => {
      const stray = (await chrome.tabs.query({})).filter((t) => t.url && !t.url.startsWith('chrome'));
      if (stray.length > 0) await chrome.tabs.remove(stray.map((t) => t.id));
    });

    // 3. Le tre strade per il Generatore, nella guida che si apre da sola, con Gemini Nano già scelto.
    const guide = await (await browser.waitForTarget((t) => t.url().endsWith('/onboarding.html'))).asPage();
    await light(guide);
    await guide.setViewport({ width: 900, height: 1000, deviceScaleFactor: 2 });
    await guide.waitForSelector('.onboarding-nav button.next');
    await guide.click('.onboarding-nav button.next');
    await guide.click('.onboarding-nav button.next');
    await guide.waitForSelector('.choices');
    await guide.mouse.move(0, 0);
    const choices = await guide.screenshot({ clip: { x: 0, y: 0, width: 900, height: 600 } });

    await sw.evaluate((host) => chrome.storage.sync.set({ generator: { preset: 'custom', baseUrl: `https://${host}/v1`, model: 'demo' } }), AI_HOST);
    for (const [host, p] of [GROUPED, ...TABS]) {
      const page = await browser.newPage();
      await page.goto(`https://${host}${p}`);
    }
    await pause(500);
    // Un gruppo già aperto, che la proposta estenderà con l'altra tab di Jira.
    await sw.evaluate(async (url, name) => {
      const [tab] = await chrome.tabs.query({ url });
      const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
      await chrome.tabGroups.update(groupId, { title: name, color: 'blue' });
    }, `https://${GROUPED[0]}${GROUPED[1]}`, copy.group);

    // 1. Proposta con l'AI nel pannello.
    const panel = await browser.newPage();
    await light(panel);
    await panel.setViewport({ width: 400, height: 800, deviceScaleFactor: 2 });
    await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
    await panel.waitForSelector('.group:not(.existing)', { timeout: 15000 });
    await pause(800);
    const proposal = await panel.screenshot();

    // 2. Anteprima per sito mentre il Generatore non risponde.
    ai.hang = true;
    await (await panel.$$('footer button.secondary:not(.undo)'))[0].click();
    await panel.mouse.move(0, 0);
    await panel.waitForSelector('.group.preview', { timeout: 10000 });
    await pause(500);
    const previewShot = await panel.screenshot();
    await panel.click('.status.computing button.abort');
    ai.hang = false;
    for (const res of pending) res.destroy();
    pending.clear();

    // 4. Categorie nelle impostazioni.
    const options = await browser.newPage();
    await light(options);
    await options.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });
    await options.goto(`chrome-extension://${extId}/options.html`);
    await options.waitForSelector('#categories .category');
    const card = await options.$('#categories');
    const box = await card.boundingBox();
    const categories = await options.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 640) } });

    const shots = [[proposal, false], [previewShot, false], [choices, true], [categories, true]];
    for (const [i, [png, wide]] of shots.entries()) {
      await render(browser, frame(png, copy.shots[i], wide), 1280, 800, `${out}/screenshot-${i + 1}.png`);
    }
    await render(browser, tile(copy.tagline), 440, 280, `${out}/promo-small.png`);
    if (locale === 'it') await render(browser, storeIcon, 128, 128, 'docs/store/icon-128.png', true);
    console.log(`${locale}: ${shots.length} screenshot e la tile in ${out}`);
  } finally {
    await browser.close();
  }
}
server.closeAllConnections();
server.close();
