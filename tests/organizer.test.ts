import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { DEFAULT_SETTINGS, loadSettings, normalizeDomain, resetCategories, saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
});

/** Nomi dei gruppi proposti con i titoli delle loro tab. */
async function proposedGroups(windowId = W) {
  const state = await organizer.propose(windowId);
  return state.proposal!.groups.map((g) => ({ name: g.name, tabs: g.tabs.map((t) => t.title) }));
}

describe('proposta per dominio', () => {
  it('raggruppa le tab dello stesso dominio, con nome senza "www." e provenienza dominio', async () => {
    strip.addTab({ url: 'https://www.github.com/a', title: 'GH A' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN' });
    strip.addTab({ url: 'https://github.com/b?x=1#y', title: 'GH B' });

    const state = await organizer.propose(W);

    expect(state.phase).toBe('ready');
    expect(state.proposal!.groups).toMatchObject([
      { name: 'github.com', provenance: 'domain', tabs: [{ title: 'GH A' }, { title: 'GH B' }] },
    ]);
  });

  it('non crea gruppi di una sola tab', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });

    expect(await proposedGroups()).toEqual([]);
  });

  it('considera solo le tab libere e reali della finestra corrente', async () => {
    strip.addTab({ url: 'https://site.com/pinned', title: 'Fissata', pinned: true });
    strip.addTab({ url: 'https://site.com/other-window', title: 'Altra finestra', windowId: 2 });
    const inGroup = strip.addTab({ url: 'https://site.com/grouped', title: 'Già raggruppata' });
    await strip.addGroup('Mio', 'blue', [inGroup]);
    strip.addTab({ url: 'chrome://newtab/', title: 'Nuova scheda' });
    strip.addTab({ url: 'chrome-extension://abc/page.html', title: 'Estensione' });
    strip.addTab({ url: 'https://site.com/loading', title: '' });
    strip.addTab({ url: 'https://site.com/loading2', title: 'https://site.com/loading2' });
    strip.addTab({ url: 'https://site.com/1', title: 'Uno' });
    strip.addTab({ url: 'https://site.com/2', title: 'Due' });

    expect(await proposedGroups()).toEqual([{ name: 'site.com', tabs: ['Uno', 'Due'] }]);
  });

  it('assegna ai gruppi nuovi i colori non ancora usati nella finestra, a rotazione', async () => {
    const mine = strip.addTab({ url: 'https://mine.com/', title: 'Mia' });
    await strip.addGroup('Mio', 'grey', [mine]);
    for (const site of ['a.com', 'b.com', 'c.com']) {
      strip.addTab({ url: `https://${site}/1`, title: `${site} 1` });
      strip.addTab({ url: `https://${site}/2`, title: `${site} 2` });
    }

    const { proposal } = await organizer.propose(W);

    expect(proposal!.groups.map((g) => g.color)).toEqual(['blue', 'red', 'yellow']);
  });

  it('non sposta né raggruppa nessuna tab prima di "Applica"', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const before = strip.layout();

    await organizer.propose(W);

    expect(strip.layout()).toEqual(before);
    expect(strip.groupsIn()).toEqual([]);
  });

  it('conserva la proposta nello stato di sessione, così il pannello la ritrova', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    const first = await organizer.propose(W);
    // Un nuovo Organizzatore simula il service worker riavviato o il pannello riaperto.
    const reopened = createOrganizer();
    const state = await reopened.state();

    expect(state.phase).toBe('ready');
    expect(state.proposal).toEqual(first.proposal);
    expect(await reopened.propose(W)).toEqual(first);
  });

  it('riconosce un calcolo in corso: due richieste insieme producono una sola proposta', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    const [a, b] = await Promise.all([organizer.propose(W), organizer.propose(W)]);

    expect(a.proposal!.createdAt).toBe(b.proposal!.createdAt);
  });
});

describe('applica', () => {
  it('crea in Chrome esattamente i gruppi della proposta, con nome e colore', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    strip.addTab({ url: 'https://c.com/1', title: 'C1' });

    await organizer.propose(W);
    const state = await organizer.apply();

    expect(state.phase).toBe('idle');
    expect(strip.groupsIn().map(({ title, color, tabs }) => ({ title, color, tabs }))).toEqual([
      { title: 'a.com', color: 'grey', tabs: ['A1', 'A2'] },
      { title: 'b.com', color: 'blue', tabs: ['B1', 'B2'] },
    ]);
    expect(strip.layout()).toContain('C1');
  });

  it('non tocca i gruppi già aperti', async () => {
    const mine = strip.addTab({ url: 'https://a.com/mine', title: 'Mia' });
    await strip.addGroup('Mio', 'red', [mine]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    await organizer.propose(W);
    await organizer.apply();

    expect(strip.groupsIn().map(({ title, color, tabs }) => ({ title, color, tabs }))).toEqual([
      { title: 'Mio', color: 'red', tabs: ['Mia'] },
      { title: 'a.com', color: 'grey', tabs: ['A1', 'A2'] },
    ]);
  });

  it('salta le tab chiuse tra la proposta e "Applica"', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const closed = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://a.com/3', title: 'A3' });

    await organizer.propose(W);
    await strip.closeTab(closed);
    await organizer.apply();

    expect(strip.groupsIn().map((g) => g.tabs)).toEqual([['A1', 'A3']]);
  });

  it('dopo "Applica" la proposta non c\'è più e una nuova apertura ricalcola', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    await organizer.propose(W);
    await organizer.apply();

    expect((await organizer.state()).proposal).toBeUndefined();
    expect(await proposedGroups()).toEqual([]);
  });
});

describe('annulla', () => {
  /** Barra mista: tab fissata, gruppo dell'utente, tab libere di due domini e una tab singola. */
  async function mixedStrip() {
    strip.addTab({ url: 'https://pinned.com/', title: 'Fissata', pinned: true });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    const mine = strip.addTab({ url: 'https://mine.com/', title: 'Mia' });
    await strip.addGroup('Mio', 'red', [mine]);
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://c.com/1', title: 'C1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    strip.addTab({ url: 'https://a.com/3', title: 'A3' });
  }

  it('non è disponibile prima di "Applica", lo è dopo', async () => {
    await mixedStrip();

    expect((await organizer.propose(W)).undo).toBeUndefined();
    expect((await organizer.apply()).undo).toBeDefined();
  });

  it('riporta ogni tab nella posizione e nel gruppo originali e scioglie i gruppi creati', async () => {
    await mixedStrip();
    const before = strip.layout();

    await organizer.propose(W);
    await organizer.apply();
    expect(strip.layout()).not.toEqual(before);
    const state = await organizer.undo();

    expect(strip.layout()).toEqual(before);
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Mio']);
    expect(state.undo).toBeUndefined();
  });

  it('ignora le tab chiuse nel frattempo', async () => {
    await mixedStrip();
    const before = strip.layout();
    await organizer.propose(W);
    await organizer.apply();

    const a2 = (await fakeBrowser.tabs.query({})).find((t) => t.title === 'A2')!;
    await strip.closeTab(a2.id!);
    const state = await organizer.undo();

    expect(state.error).toBeUndefined();
    expect(strip.layout()).toEqual(before.filter((t) => t !== 'A2'));
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Mio']);
  });

  it('non tocca le tab aperte dopo', async () => {
    await mixedStrip();
    const before = strip.layout();
    await organizer.propose(W);
    await organizer.apply();

    strip.addTab({ url: 'https://new.com/', title: 'Nuova' });
    await organizer.undo();

    expect(strip.layout()).toEqual([...before, 'Nuova']);
  });

  it('non rinomina all\'indietro i gruppi rinominati dall\'utente', async () => {
    await mixedStrip();
    await organizer.propose(W);
    await organizer.apply();

    const [mio] = await fakeBrowser.tabGroups.query({ title: 'Mio' });
    await fakeBrowser.tabGroups.update(mio!.id, { title: 'Rinominato' });
    await organizer.undo();

    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Rinominato']);
  });

  it('resta disponibile dopo una nuova proposta e vale solo per l\'ultima operazione', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    await organizer.propose(W);
    await organizer.apply();
    const afterFirst = strip.layout();

    // Riaprendo il pannello si calcola una nuova proposta: l'annulla resta.
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    const reopened = await organizer.propose(W);
    expect(reopened.undo).toBeDefined();

    await organizer.apply();
    await organizer.undo();

    // Si torna allo stato dopo la prima organizzazione, non a quello iniziale.
    expect(strip.layout()).toEqual([...afterFirst, 'B1', 'B2'].filter((t, i, all) => all.indexOf(t) === i));
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['a.com']);
    expect((await organizer.state()).undo).toBeUndefined();
  });
});

describe('anteprima modificabile', () => {
  /** Tre domini con due tab ciascuno: a.com, b.com, c.com. */
  async function threeDomains() {
    for (const site of ['a.com', 'b.com', 'c.com']) {
      strip.addTab({ url: `https://${site}/1`, title: `${site} 1` });
      strip.addTab({ url: `https://${site}/2`, title: `${site} 2` });
    }
    const { proposal } = await organizer.propose(W);
    const id = (name: string) => proposal!.groups.find((g) => g.name === name)!.id;
    const tab = (title: string) => proposal!.groups.flatMap((g) => g.tabs).find((t) => t.title === title)!.tabId;
    return { id, tab };
  }

  const appliedGroups = () => strip.groupsIn().map(({ title, color, tabs }) => ({ title, color, tabs }));

  it('"Applica" crea esattamente i gruppi della proposta modificata', async () => {
    const { id, tab } = await threeDomains();

    await organizer.edit({ kind: 'rename', groupId: id('a.com'), name: '  Lavoro  ' });
    await organizer.edit({ kind: 'recolor', groupId: id('a.com'), color: 'purple' });
    await organizer.edit({ kind: 'move-tab', tabId: tab('b.com 1'), toGroupId: id('a.com') });
    await organizer.edit({ kind: 'remove-tab', tabId: tab('b.com 2') });
    await organizer.edit({ kind: 'discard-group', groupId: id('c.com') });
    await organizer.apply();

    expect(appliedGroups()).toEqual([{ title: 'Lavoro', color: 'purple', tabs: ['a.com 1', 'a.com 2', 'b.com 1'] }]);
    expect(strip.layout().filter((t) => !t.includes('['))).toEqual(['b.com 2', 'c.com 1', 'c.com 2']);
  });

  it('un gruppo rimasto senza tab sparisce dalla proposta', async () => {
    const { id, tab } = await threeDomains();

    await organizer.edit({ kind: 'move-tab', tabId: tab('b.com 1'), toGroupId: id('a.com') });
    const state = await organizer.edit({ kind: 'move-tab', tabId: tab('b.com 2'), toGroupId: id('c.com') });

    expect(state.proposal!.groups.map((g) => [g.name, g.tabs.map((t) => t.title)])).toEqual([
      ['a.com', ['a.com 1', 'a.com 2', 'b.com 1']],
      ['c.com', ['c.com 1', 'c.com 2', 'b.com 2']],
    ]);
  });

  it('le modifiche restano nello stato, così sopravvivono alla chiusura del pannello', async () => {
    const { id } = await threeDomains();

    const edited = await organizer.edit({ kind: 'rename', groupId: id('b.com'), name: 'Video' });
    const reopened = await createOrganizer().propose(W);

    expect(reopened.proposal).toEqual(edited.proposal);
    expect(reopened.proposal!.groups.map((g) => g.name)).toEqual(['a.com', 'Video', 'c.com']);
  });

  it('ignora le modifiche a gruppi o tab che non esistono', async () => {
    const { id } = await threeDomains();
    const before = (await organizer.state()).proposal;

    await organizer.edit({ kind: 'rename', groupId: 'g99', name: 'X' });
    await organizer.edit({ kind: 'move-tab', tabId: 12345, toGroupId: id('a.com') });
    await organizer.edit({ kind: 'remove-tab', tabId: 12345 });

    expect((await organizer.state()).proposal).toEqual(before);
  });

  it('ogni gruppo indica la provenienza e le sue tab', async () => {
    await threeDomains();
    const { proposal } = await organizer.state();

    for (const group of proposal!.groups) {
      expect(group.provenance).toBe('domain');
      expect(group.tabs.length).toBeGreaterThan(0);
    }
  });
});

describe('impostazioni: comportamento e domini esclusi', () => {
  it('di default il minimo è 2 e non ci sono domini esclusi, salvati in storage.sync', async () => {
    expect(await loadSettings()).toMatchObject(DEFAULT_SETTINGS);
    await saveSettings({ minTabs: 4, excludedDomains: ['bank.com'] });
    expect(await fakeBrowser.storage.sync.get(['minTabs', 'excludedDomains'])).toEqual({
      minTabs: 4,
      excludedDomains: ['bank.com'],
    });
  });

  it('con un minimo di 3 tab un dominio con 2 tab non forma un gruppo', async () => {
    await saveSettings({ minTabs: 3 });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    strip.addTab({ url: 'https://b.com/3', title: 'B3' });

    expect(await proposedGroups()).toEqual([{ name: 'b.com', tabs: ['B1', 'B2', 'B3'] }]);
  });

  it('con un minimo di 1 anche una tab sola forma un gruppo', async () => {
    await saveSettings({ minTabs: 1 });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });

    expect(await proposedGroups()).toEqual([
      { name: 'a.com', tabs: ['A1'] },
      { name: 'b.com', tabs: ['B1'] },
    ]);
  });

  it('il minimo modificato vale per le proposte successive', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    expect(await proposedGroups()).toHaveLength(1);

    await saveSettings({ minTabs: 3 });
    const { proposal } = await organizer.propose(W, { force: true });

    expect(proposal!.groups).toEqual([]);
  });

  it('rifiuta un minimo che non è un intero maggiore o uguale a 1', async () => {
    await expect(saveSettings({ minTabs: 0 })).rejects.toThrow();
    await expect(saveSettings({ minTabs: 1.5 })).rejects.toThrow();
    expect((await loadSettings()).minTabs).toBe(2);
  });

  it('le tab dei domini esclusi e dei loro sottodomini restano fuori dalla proposta', async () => {
    await saveSettings({ excludedDomains: ['google.com'] });
    strip.addTab({ url: 'https://mail.google.com/1', title: 'Posta 1' });
    strip.addTab({ url: 'https://mail.google.com/2', title: 'Posta 2' });
    strip.addTab({ url: 'https://www.google.com/search', title: 'Ricerca' });
    strip.addTab({ url: 'https://google.com/maps', title: 'Mappe' });
    strip.addTab({ url: 'https://notgoogle.com/1', title: 'Altro 1' });
    strip.addTab({ url: 'https://notgoogle.com/2', title: 'Altro 2' });

    expect(await proposedGroups()).toEqual([{ name: 'notgoogle.com', tabs: ['Altro 1', 'Altro 2'] }]);
  });

  it('le tab dei domini esclusi restano libere dopo "Applica"', async () => {
    await saveSettings({ excludedDomains: ['bank.com'] });
    strip.addTab({ url: 'https://bank.com/1', title: 'Banca 1' });
    strip.addTab({ url: 'https://bank.com/2', title: 'Banca 2' });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    await organizer.propose(W);
    await organizer.apply();

    expect(strip.layout()).toEqual(['Banca 1', 'Banca 2', 'A1 [a.com]', 'A2 [a.com]']);
  });

  it('normalizza i domini scritti dall\'utente', () => {
    expect(normalizeDomain('  https://www.Google.com/path?q=1 ')).toBe('google.com');
    expect(normalizeDomain('mail.google.com')).toBe('mail.google.com');
    expect(normalizeDomain('localhost:8080')).toBe('localhost');
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('non un dominio')).toBeNull();
  });
});

describe('robustezza (review AG-R1)', () => {
  it('una proposta chiesta mentre si applica non cancella la foto per "Annulla"', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const before = strip.layout();
    await organizer.propose(W);

    const [, reopened] = await Promise.all([organizer.apply(), organizer.propose(W, { force: true })]);

    expect(reopened.undo).toBeDefined();
    expect((await organizer.state()).undo).toBeDefined();
    await organizer.undo();
    expect(strip.layout()).toEqual(before);
  });

  it('riaprendo il pannello ricalcola se le tab libere sono cambiate', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    await organizer.propose(W);

    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });

    expect(await proposedGroups()).toEqual([
      { name: 'a.com', tabs: ['A1', 'A2'] },
      { name: 'b.com', tabs: ['B1', 'B2'] },
    ]);
  });

  it('riaprendo il pannello tiene la proposta modificata se le tab libere non sono cambiate', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const { proposal } = await organizer.propose(W);
    await organizer.edit({ kind: 'rename', groupId: proposal!.groups[0]!.id, name: 'Mio nome' });

    expect((await proposedGroups())[0]!.name).toBe('Mio nome');
  });

  it('lo stato indica sempre la finestra a cui si riferisce', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    expect((await organizer.propose(W)).windowId).toBe(W);
    expect((await organizer.apply()).windowId).toBe(W);
    expect((await organizer.undo()).windowId).toBe(W);
  });
});

describe('catalogo categorie', () => {
  const names = async () => (await loadSettings()).categories.map((c) => c.name);

  it('al primo avvio ci sono le 10 categorie predefinite in italiano, con descrizione e colore', async () => {
    const { categories } = await loadSettings();

    expect(categories.map((c) => c.name)).toEqual([
      'Lavoro', 'Sviluppo', 'AI', 'Social', 'Notizie', 'Video', 'Shopping', 'Viaggi', 'Finanza', 'Studio',
    ]);
    for (const c of categories) {
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.color).toMatch(/^(grey|blue|red|yellow|green|pink|purple|cyan|orange)$/);
    }
  });

  it('con il browser in inglese le categorie predefinite sono in inglese', async () => {
    installFakeI18n('en');

    expect(await names()).toEqual([
      'Work', 'Dev', 'AI', 'Social', 'News', 'Video', 'Shopping', 'Travel', 'Finance', 'Study',
    ]);
  });

  it('si possono aggiungere, modificare, eliminare e riordinare, e la lista va in storage.sync', async () => {
    const { categories } = await loadSettings();
    const [work, dev, ...rest] = categories;
    const edited = [
      dev!,
      { ...work!, name: '  Ufficio ', color: 'red' as const },
      ...rest.filter((c) => c.name !== 'Shopping'),
      { id: 'mine', name: 'Cucina', description: 'Ricette e cucina', color: 'orange' as const },
    ];

    await saveSettings({ categories: edited });

    expect(await names()).toEqual([
      'Sviluppo', 'Ufficio', 'AI', 'Social', 'Notizie', 'Video', 'Viaggi', 'Finanza', 'Studio', 'Cucina',
    ]);
    expect((await loadSettings()).categories[1]!.color).toBe('red');
    const stored = await fakeBrowser.storage.sync.get('categories');
    expect((stored.categories as { name: string }[]).map((c) => c.name)).toEqual(await names());
  });

  it('rifiuta i nomi duplicati senza distinguere maiuscole e minuscole, e i nomi vuoti', async () => {
    const { categories } = await loadSettings();

    await expect(
      saveSettings({ categories: [...categories, { id: 'x', name: 'lavoro ', description: '', color: 'red' }] }),
    ).rejects.toMatchObject({ messageKey: 'categoryNameDuplicate' });
    await expect(
      saveSettings({ categories: [...categories, { id: 'y', name: '   ', description: '', color: 'red' }] }),
    ).rejects.toMatchObject({ messageKey: 'categoryNameEmpty' });
    expect(await fakeBrowser.storage.sync.get('categories')).toEqual({});
  });

  it('"Ripristina default" riporta la lista iniziale', async () => {
    await saveSettings({ categories: [{ id: 'mine', name: 'Cucina', description: '', color: 'orange' }] });
    expect(await names()).toEqual(['Cucina']);

    const restored = await resetCategories();

    expect(restored.map((c) => c.name)).toEqual(await names());
    expect(await names()).toHaveLength(10);
  });

  it('una lista vuota è ammessa', async () => {
    await saveSettings({ categories: [] });

    expect(await names()).toEqual([]);
  });

  it('le categorie modificate rendono non più attuale una proposta salvata', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const first = await organizer.propose(W);

    await saveSettings({ categories: [] });
    const second = await organizer.propose(W);

    expect(second.proposal!.createdAt).toBeGreaterThanOrEqual(first.proposal!.createdAt);
    expect(second.proposal!.signature).not.toBe(first.proposal!.signature);
  });
});
