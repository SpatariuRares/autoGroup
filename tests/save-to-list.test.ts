import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { loadSettings, saveSettings } from '../src/settings';
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

  it('la proposta resta valida dopo il salvataggio: riaprendo il popup non viene ricalcolata', async () => {
    generator();
    await organizer.propose(W);
    const id = await groupId('Cucina');
    await organizer.edit({ kind: 'rename', groupId: id, name: 'Ricette' });
    const saved = await organizer.saveToList(id);

    expect((await createOrganizer().propose(W)).proposal).toEqual(saved.proposal);
  });

  it('una tab aperta mentre si genera la descrizione rende la proposta scaduta: riaprendo il popup si ricalcola', async () => {
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

  it('non duplica una categoria con lo stesso nome, senza distinguere maiuscole e minuscole', async () => {
    generator();
    await organizer.propose(W);
    const id = await groupId('Cucina');
    await organizer.edit({ kind: 'rename', groupId: id, name: 'LAVORO' });

    const state = await organizer.saveToList(id);

    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro']);
    expect(state.notice).toEqual({ key: 'saveToListDuplicate', arg: 'LAVORO' });
  });

  it('vale solo per i gruppi "nuovo AI"', async () => {
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
