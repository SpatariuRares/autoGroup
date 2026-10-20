import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { loadSettings, saveSettings } from '../src/settings';
import { loadDescribing } from '../src/shared/describing';
import { installFakeI18n } from './fake-i18n';
import { httpError, installFakeFetch, installFakePermissions, openAiReply, type RecordedRequest } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({
    generator: { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' },
    categories: [{ id: 'w', name: 'Lavoro', description: 'Lavoro', color: 'blue' }],
  });
  strip.addTab({ url: 'https://cucina.it/pasta?utm=x', title: 'Pasta al forno' });
  strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza in casa' });
  strip.addTab({ url: 'https://mail.com/', title: 'Posta' });
  strip.addTab({ url: 'https://docs.com/', title: 'Documento' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Generatore finto: propone "Cucina" (nuovo) e "Lavoro" (lista); "descrivi" risponde `description`. */
function generator(description: string | Response = 'Ricette, cucina e siti di cibo.') {
  return installFakeFetch((request: RecordedRequest) => {
    const isDescribe = request.body.messages[0].content.includes('description of a category');
    if (isDescribe) return typeof description === 'string' ? openAiReply(description) : description;
    return openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2'] }, { name: 'Lavoro', tabs: ['t3', 't4'] }] });
  });
}

const groupId = async (name: string) => (await organizer.state()).proposal!.groups.find((g) => g.name === name)!.id;

describe('Salva nella lista', () => {
  it('aggiunge la categoria con nome e colore attuali del gruppo e la descrizione generata', async () => {
    const { requests } = generator('  «Ricette, cucina e siti di cibo.»  ');
    await organizer.propose(W);
    const id = await groupId('Cucina');
    await organizer.edit({ kind: 'rename', groupId: id, name: 'Ricette' });
    await organizer.edit({ kind: 'recolor', groupId: id, color: 'orange' });

    const state = await organizer.saveToList(id);

    expect((await loadSettings()).categories.map(({ name, description, color }) => ({ name, description, color }))).toEqual([
      { name: 'Lavoro', description: 'Lavoro', color: 'blue' },
      { name: 'Ricette', description: 'Ricette, cucina e siti di cibo.', color: 'orange' },
    ]);
    expect(state.notice).toEqual({ key: 'saveToListSaved', arg: 'Ricette' });
    expect(state.proposal!.groups.find((g) => g.id === id)!.provenance).toBe('list');
    // Alla descrizione arrivano nome ed esempi ripuliti.
    const describe = JSON.parse(requests.at(-1)!.body.messages[1].content);
    expect(describe).toEqual({
      category: 'Ricette',
      example_tabs: [
        { title: 'Pasta al forno', url: 'cucina.it/pasta' },
        { title: 'Pizza in casa', url: 'cucina.it/pizza' },
      ],
    });
  });

  it('la proposta resta valida dopo il salvataggio: riaprendo il pannello non viene ricalcolata', async () => {
    generator();
    await organizer.propose(W);
    const id = await groupId('Cucina');
    await organizer.edit({ kind: 'rename', groupId: id, name: 'Ricette' });
    const saved = await organizer.saveToList(id);

    expect((await createOrganizer().propose(W)).proposal).toEqual(saved.proposal);
  });

  it('una tab aperta mentre si genera la descrizione rende la proposta scaduta: riaprendo il pannello si ricalcola', async () => {
    installFakeFetch((request: RecordedRequest) => {
      if (!request.body.messages[0].content.includes('description of a category')) {
        return openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2'] }, { name: 'Lavoro', tabs: ['t3', 't4'] }] });
      }
      strip.addTab({ url: 'https://cucina.it/dolci', title: 'Dolci' });
      return openAiReply('Ricette, cucina e siti di cibo.');
    });
    await organizer.propose(W);
    const saved = await organizer.saveToList(await groupId('Cucina'));

    const reopened = await createOrganizer().propose(W);

    expect(reopened.proposal!.signature).not.toBe(saved.proposal!.signature);
  });

  it('se il Generatore non risponde salva la categoria con la descrizione vuota e un avviso', async () => {
    generator(httpError(503));
    await organizer.propose(W);

    const state = await organizer.saveToList(await groupId('Cucina'));

    expect((await loadSettings()).categories.at(-1)).toMatchObject({ name: 'Cucina', description: '' });
    expect(state.notice).toEqual({ key: 'saveToListNoDescription', arg: 'Cucina' });
  });

  it('una descrizione tagliata dal limite di token non viene salvata: categoria senza descrizione e avviso', async () => {
    // Come un modello con il "ragionamento" che esaurisce i token prima di finire la frase.
    const truncated = new Response(
      JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Pasta, tiramisù, and' }, finish_reason: 'length' }] }),
      { headers: { 'content-type': 'application/json' } },
    );
    const { requests } = generator(truncated);
    await organizer.propose(W);

    const state = await organizer.saveToList(await groupId('Cucina'));

    expect(requests.at(-1)!.body.max_tokens).toBeGreaterThanOrEqual(1000);
    expect((await loadSettings()).categories.at(-1)).toMatchObject({ name: 'Cucina', description: '' });
    expect(state.notice).toEqual({ key: 'saveToListNoDescription', arg: 'Cucina' });
  });

  it('non duplica una categoria con lo stesso nome, senza distinguere maiuscole e minuscole', async () => {
    generator();
    await organizer.propose(W);
    const id = await groupId('Cucina');
    await organizer.edit({ kind: 'rename', groupId: id, name: 'LAVORO' });

    const state = await organizer.saveToList(id);

    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro']);
    expect(state.notice).toEqual({ key: 'saveToListDuplicate', arg: 'LAVORO' });
  });

  it('non vale per i gruppi che sono già una categoria', async () => {
    generator();
    await organizer.propose(W);

    await organizer.saveToList(await groupId('Lavoro'));

    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro']);
  });

  it('alla successiva organizzazione la categoria salvata è tra le opzioni', async () => {
    const { requests } = generator();
    await organizer.propose(W);
    await organizer.saveToList(await groupId('Cucina'));

    await organizer.propose(W, { force: true });

    const options = JSON.parse(requests.at(-1)!.body.messages[1].content).options;
    expect(options).toContainEqual({ name: 'Cucina', description: 'Ricette, cucina e siti di cibo.' });
  });

  it('una modifica successiva toglie l\'avviso', async () => {
    generator();
    await organizer.propose(W);
    await organizer.saveToList(await groupId('Cucina'));

    const state = await organizer.edit({ kind: 'rename', groupId: await groupId('Lavoro'), name: 'Ufficio' });

    expect(state.notice).toBeUndefined();
  });
});

describe('Aggiungi alle categorie: la categoria c\'è subito, la descrizione arriva dopo', () => {
  /** Generatore finto che, mentre "scrive" la descrizione, esegue `during` (es. guarda le impostazioni). */
  function slowGenerator(during: () => Promise<void>, description = 'Ricette e cucina.') {
    return installFakeFetch(async (request: RecordedRequest) => {
      if (!request.body.messages[0].content.includes('description of a category')) {
        return openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2'] }, { name: 'Lavoro', tabs: ['t3', 't4'] }] });
      }
      await during();
      return openAiReply(description);
    });
  }

  it('mentre l\'AI scrive, la categoria è già salvata senza descrizione e segnata "in descrizione"', async () => {
    let meanwhile: { description?: string; describing: string[] } | undefined;
    slowGenerator(async () => {
      const cucina = (await loadSettings()).categories.find((c) => c.name === 'Cucina');
      meanwhile = { description: cucina?.description, describing: (await loadDescribing()).map((id) => (id === cucina?.id ? 'Cucina' : id)) };
    });
    await organizer.propose(W);

    const state = await organizer.saveToList(await groupId('Cucina'));

    expect(meanwhile).toEqual({ description: '', describing: ['Cucina'] });
    expect((await loadSettings()).categories.at(-1)).toMatchObject({ name: 'Cucina', description: 'Ricette e cucina.' });
    expect(await loadDescribing()).toEqual([]);
    expect(state.notice).toEqual({ key: 'saveToListSaved', arg: 'Cucina' });
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
  });

  it('una descrizione scritta a mano nel frattempo resta', async () => {
    slowGenerator(async () => {
      const { categories } = await loadSettings();
      await saveSettings({ categories: categories.map((c) => (c.name === 'Cucina' ? { ...c, description: 'La mia descrizione' } : c)) });
    });
    await organizer.propose(W);

    await organizer.saveToList(await groupId('Cucina'));

    expect((await loadSettings()).categories.at(-1)).toMatchObject({ name: 'Cucina', description: 'La mia descrizione' });
    expect(await loadDescribing()).toEqual([]);
  });

  it('se il Generatore fallisce la categoria non resta "in descrizione"', async () => {
    generator(httpError(503));
    await organizer.propose(W);

    await organizer.saveToList(await groupId('Cucina'));

    expect(await loadDescribing()).toEqual([]);
  });
});

describe('Aggiungi alle categorie: gruppi per sito e gruppi aperti', () => {
  it('un gruppo per sito si aggiunge senza descrizione e senza chiedere nulla all\'AI', async () => {
    const { requests } = generator();
    await saveSettings({ mode: 'domain' });
    await organizer.propose(W);
    const id = await groupId('cucina.it');

    const state = await organizer.saveToList(id);

    expect((await loadSettings()).categories.map(({ name, description }) => ({ name, description }))).toContainEqual({ name: 'cucina.it', description: '' });
    expect(state.notice).toEqual({ key: 'saveToListNoDescription', arg: 'cucina.it' });
    expect(state.proposal!.groups.find((g) => g.id === id)!.provenance).toBe('list');
    expect(requests).toEqual([]);
  });

  it('un gruppo aperto in Chrome si aggiunge con il suo nome, il suo colore e la descrizione dalle sue tab', async () => {
    const { requests } = generator('Ricette e cucina.');
    const [pasta, pizza] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const chromeGroup = await strip.addGroup('Cucina', 'orange', [pasta!, pizza!]);
    expect((await organizer.view(W)).existing[0]!.isCategory).toBe(false);

    const state = await organizer.saveOpenGroupToList(chromeGroup);

    expect((await loadSettings()).categories.map(({ name, description, color }) => ({ name, description, color }))).toContainEqual({
      name: 'Cucina',
      description: 'Ricette e cucina.',
      color: 'orange',
    });
    expect(state.notice).toEqual({ key: 'saveToListSaved', arg: 'Cucina' });
    expect(JSON.parse(requests.at(-1)!.body.messages[1].content).example_tabs.map((t: { title: string }) => t.title)).toEqual(['Pasta al forno', 'Pizza in casa']);
    expect((await organizer.view(W)).existing[0]!.isCategory).toBe(true);
  });

  it('un gruppo aperto che è già una categoria (o senza nome) non si aggiunge', async () => {
    generator();
    const [pasta, pizza] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const lavoro = await strip.addGroup('lavoro', 'blue', [pasta!]);
    const unnamed = await strip.addGroup('', 'red', [pizza!]);

    expect((await organizer.view(W)).existing.map((e) => e.isCategory)).toEqual([true, false]);
    expect((await organizer.saveOpenGroupToList(lavoro)).notice).toEqual({ key: 'saveToListDuplicate', arg: 'lavoro' });
    await organizer.saveOpenGroupToList(unnamed);
    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro']);
  });
});

describe('Rinomina un gruppo aperto', () => {
  it('cambia il nome in Chrome e nella proposta che lo estende; una proposta attuale resta attuale', async () => {
    generator();
    const [pasta] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const cucina = await strip.addGroup('Cucina', 'orange', [pasta!]);
    await organizer.propose(W);

    const state = await organizer.renameGroup(cucina, '  Ricette  ');

    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Ricette']);
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
    expect(state.proposal!.groups.filter((g) => g.existingGroupId === cucina).map((g) => g.name)).toEqual(['Ricette']);
  });

  it('un gruppo aperto che è una categoria rinomina anche la categoria (descrizione, colore e siti restano)', async () => {
    await saveSettings({ categorySites: { w: ['docs.com'] } });
    const [, , mail] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const lavoro = await strip.addGroup('LAVORO', 'blue', [mail!]);

    await organizer.renameGroup(lavoro, 'Ufficio');

    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Ufficio']);
    const settings = await loadSettings();
    expect(settings.categories).toEqual([{ id: 'w', name: 'Ufficio', description: 'Lavoro', color: 'blue' }]);
    expect(settings.categorySites).toEqual({ w: ['docs.com'] });
    expect((await organizer.view(W)).existing[0]!.isCategory).toBe(true);
  });

  it('un gruppo della proposta che è una categoria rinomina anche la categoria e resta "lista"', async () => {
    generator();
    await organizer.propose(W);

    const state = await organizer.edit({ kind: 'rename', groupId: await groupId('Lavoro'), name: 'Ufficio' });

    expect(state.proposal!.groups.map((g) => [g.name, g.provenance])).toContainEqual(['Ufficio', 'list']);
    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Ufficio']);
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
  });

  it('non rinomina una categoria con il nome di un\'altra (né vuoto): nulla cambia e lo dice', async () => {
    await saveSettings({ categories: [{ id: 'w', name: 'Lavoro', description: 'Lavoro', color: 'blue' }, { id: 's', name: 'Studio', description: '', color: 'red' }] });
    const [, , mail] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const lavoro = await strip.addGroup('Lavoro', 'blue', [mail!]);

    const state = await organizer.renameGroup(lavoro, 'studio');
    await organizer.renameGroup(lavoro, '  ');

    expect(state.notice).toEqual({ key: 'categoryNameDuplicate' });
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Lavoro']);
    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro', 'Studio']);
  });

  it('un gruppo che non esiste più non cambia nulla', async () => {
    const before = await organizer.state();

    expect(await organizer.renameGroup(9999, 'Nuovo')).toEqual(before);
  });
});

describe('Esempi per la descrizione', () => {
  it('non manda mai all\'AI pagine del browser o di domini esclusi di un gruppo aperto', async () => {
    const { requests } = generator();
    await saveSettings({ excludedDomains: ['mail.com'] });
    const [pasta, , mail] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const settings = strip.addTab({ url: 'chrome://settings/', title: 'Impostazioni' });
    const chromeGroup = await strip.addGroup('Misto', 'green', [pasta!, mail!, settings]);

    await organizer.saveOpenGroupToList(chromeGroup);

    const examples = JSON.parse(requests.at(-1)!.body.messages[1].content).example_tabs;
    expect(examples).toEqual([{ title: 'Pasta al forno', url: 'cucina.it/pasta' }]);
  });
});
