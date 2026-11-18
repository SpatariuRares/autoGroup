import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { loadSettings, saveSettings } from '../src/settings';
import { loadDescribing } from '../src/shared/describing';
import type { OrganizerState } from '../src/shared/types';
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

/** Fake Generator: proposes "Cucina" (new) and "Lavoro" (list); "describe" replies with `description`. */
function generator(description: string | Response = 'Ricette, cucina e siti di cibo.') {
  return installFakeFetch((request: RecordedRequest) => {
    const isDescribe = request.body.messages[0].content.includes('description of a category');
    if (isDescribe) return typeof description === 'string' ? openAiReply(description) : description;
    return openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2'] }, { name: 'Lavoro', tabs: ['t3', 't4'] }] });
  });
}

const groupId = async (name: string) => (await organizer.state()).proposal!.groups.find((g) => g.name === name)!.id;

describe('Save to list', () => {
  it('adds the category with the group\'s current name and color and the generated description', async () => {
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
    expect(state.notice).toEqual({ key: 'saveToListSaved', arg: 'Ricette', snackbar: true });
    expect(state.proposal!.groups.find((g) => g.id === id)!.provenance).toBe('list');
    // The description request receives the cleaned name and examples.
    const describe = JSON.parse(requests.at(-1)!.body.messages[1].content);
    expect(describe).toEqual({
      category: 'Ricette',
      example_tabs: [
        { title: 'Pasta al forno', url: 'cucina.it/pasta' },
        { title: 'Pizza in casa', url: 'cucina.it/pizza' },
      ],
    });
  });

  it('the proposal stays valid after saving: reopening the panel does not recompute it', async () => {
    generator();
    await organizer.propose(W);
    const id = await groupId('Cucina');
    await organizer.edit({ kind: 'rename', groupId: id, name: 'Ricette' });
    const saved = await organizer.saveToList(id);

    expect((await createOrganizer().propose(W)).proposal).toEqual(saved.proposal);
  });

  it('a tab opened while the description is being generated makes the proposal stale: reopening the panel recomputes it', async () => {
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

  it('if the Generator does not respond, saves the category with an empty description and a warning', async () => {
    generator(httpError(503));
    await organizer.propose(W);

    const state = await organizer.saveToList(await groupId('Cucina'));

    expect((await loadSettings()).categories.at(-1)).toMatchObject({ name: 'Cucina', description: '' });
    expect(state.notice).toEqual({ key: 'saveToListNoDescription', arg: 'Cucina', snackbar: true });
  });

  it('a description cut off by the token limit is not saved: category without description and a warning', async () => {
    // Like a model with "reasoning" that exhausts its tokens before finishing the sentence.
    const truncated = new Response(
      JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Pasta, tiramisù, and' }, finish_reason: 'length' }] }),
      { headers: { 'content-type': 'application/json' } },
    );
    const { requests } = generator(truncated);
    await organizer.propose(W);

    const state = await organizer.saveToList(await groupId('Cucina'));

    expect(requests.at(-1)!.body.max_tokens).toBeGreaterThanOrEqual(1000);
    expect((await loadSettings()).categories.at(-1)).toMatchObject({ name: 'Cucina', description: '' });
    expect(state.notice).toEqual({ key: 'saveToListNoDescription', arg: 'Cucina', snackbar: true });
  });

  it('does not duplicate a category with the same name, ignoring case', async () => {
    generator();
    await organizer.propose(W);
    const id = await groupId('Cucina');
    await organizer.edit({ kind: 'rename', groupId: id, name: 'LAVORO' });

    const state = await organizer.saveToList(id);

    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro']);
    expect(state.notice).toEqual({ key: 'saveToListDuplicate', arg: 'LAVORO', snackbar: true });
  });

  it("the outcome is only for the snackbar, unlike the warning for a rejected name", async () => {
    generator();
    await organizer.propose(W);
    const [, , mail] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const open = await strip.addGroup('Posta', 'green', [mail!]);

    const saved = await organizer.saveToList(await groupId('Cucina'));
    const savedOpen = await organizer.saveOpenGroupToList(open);
    const rejected = await organizer.renameGroup(open, 'lavoro');

    expect(saved.notice).toEqual({ key: 'saveToListSaved', arg: 'Cucina', snackbar: true });
    expect(savedOpen.notice).toEqual({ key: 'saveToListSaved', arg: 'Posta', snackbar: true });
    expect(rejected.notice).toEqual({ key: 'categoryNameDuplicate' });
  });

  it('does not apply to groups that are already a category', async () => {
    generator();
    await organizer.propose(W);

    await organizer.saveToList(await groupId('Lavoro'));

    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro']);
  });

  it('on the next organization the saved category is among the options', async () => {
    const { requests } = generator();
    await organizer.propose(W);
    await organizer.saveToList(await groupId('Cucina'));

    await organizer.propose(W, { force: true });

    const options = JSON.parse(requests.at(-1)!.body.messages[1].content).options;
    expect(options).toContainEqual({ name: 'Cucina', description: 'Ricette, cucina e siti di cibo.' });
  });

  it('a later edit removes the warning', async () => {
    generator();
    await organizer.propose(W);
    await organizer.saveToList(await groupId('Cucina'));

    const state = await organizer.edit({ kind: 'rename', groupId: await groupId('Lavoro'), name: 'Ufficio' });

    expect(state.notice).toBeUndefined();
  });

  it("closing a tab or sorting the bar also removes the warning, even after reopening the panel", async () => {
    generator();
    await organizer.propose(W);
    await organizer.saveToList(await groupId('Cucina'));
    expect((await organizer.state()).notice).toEqual({ key: 'saveToListSaved', arg: 'Cucina', snackbar: true });

    const posta = (await browser.tabs.query({ windowId: W })).find((t) => t.title === 'Posta')!.id!;
    expect((await organizer.closeTab(posta)).notice).toBeUndefined();
    expect((await organizer.state()).notice).toBeUndefined();

    await organizer.saveToList(await groupId('Lavoro'));
    expect((await organizer.sortTabs(W)).notice).toBeUndefined();
    expect((await organizer.state()).notice).toBeUndefined();
  });

  it("the other open panels know the warning is gone", async () => {
    const announced: OrganizerState[] = [];
    organizer = createOrganizer({ onStateChange: (state) => announced.push(state) });
    generator();
    await organizer.propose(W);
    await organizer.saveToList(await groupId('Cucina'));

    await organizer.sortGroups(W);

    expect(announced.at(-1)?.phase).toBe('ready');
    expect(announced.at(-1)?.notice).toBeUndefined();
  });
});

describe('Add to categories: the category is there right away, the description arrives later', () => {
  /** Fake Generator that, while "writing" the description, runs `during` (e.g. reads the settings). */
  function slowGenerator(during: () => Promise<void>, description = 'Ricette e cucina.') {
    return installFakeFetch(async (request: RecordedRequest) => {
      if (!request.body.messages[0].content.includes('description of a category')) {
        return openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2'] }, { name: 'Lavoro', tabs: ['t3', 't4'] }] });
      }
      await during();
      return openAiReply(description);
    });
  }

  it('while the AI writes, the category is already saved without a description and marked "describing"', async () => {
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
    expect(state.notice).toEqual({ key: 'saveToListSaved', arg: 'Cucina', snackbar: true });
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
  });

  it('a description written by hand in the meantime is kept', async () => {
    slowGenerator(async () => {
      const { categories } = await loadSettings();
      await saveSettings({ categories: categories.map((c) => (c.name === 'Cucina' ? { ...c, description: 'La mia descrizione' } : c)) });
    });
    await organizer.propose(W);

    await organizer.saveToList(await groupId('Cucina'));

    expect((await loadSettings()).categories.at(-1)).toMatchObject({ name: 'Cucina', description: 'La mia descrizione' });
    expect(await loadDescribing()).toEqual([]);
  });

  it('if the Generator fails, the category is not left "describing"', async () => {
    generator(httpError(503));
    await organizer.propose(W);

    await organizer.saveToList(await groupId('Cucina'));

    expect(await loadDescribing()).toEqual([]);
  });
});

describe('Add to categories: site groups and open groups', () => {
  it('a site group is added without a description and without asking the AI anything', async () => {
    const { requests } = generator();
    await saveSettings({ mode: 'domain' });
    await organizer.propose(W);
    const id = await groupId('cucina.it');

    const state = await organizer.saveToList(id);

    expect((await loadSettings()).categories.map(({ name, description }) => ({ name, description }))).toContainEqual({ name: 'cucina.it', description: '' });
    expect(state.notice).toEqual({ key: 'saveToListNoDescription', arg: 'cucina.it', snackbar: true });
    expect(state.proposal!.groups.find((g) => g.id === id)!.provenance).toBe('list');
    expect(requests).toEqual([]);
  });

  it('an open Chrome group is added with its name, its color and the description from its tabs', async () => {
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
    expect(state.notice).toEqual({ key: 'saveToListSaved', arg: 'Cucina', snackbar: true });
    expect(JSON.parse(requests.at(-1)!.body.messages[1].content).example_tabs.map((t: { title: string }) => t.title)).toEqual(['Pasta al forno', 'Pizza in casa']);
    expect((await organizer.view(W)).existing[0]!.isCategory).toBe(true);
  });

  it('an open group that is already a category (or unnamed) is not added', async () => {
    generator();
    const [pasta, pizza] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const lavoro = await strip.addGroup('lavoro', 'blue', [pasta!]);
    const unnamed = await strip.addGroup('', 'red', [pizza!]);

    expect((await organizer.view(W)).existing.map((e) => e.isCategory)).toEqual([true, false]);
    expect((await organizer.saveOpenGroupToList(lavoro)).notice).toEqual({ key: 'saveToListDuplicate', arg: 'lavoro', snackbar: true });
    await organizer.saveOpenGroupToList(unnamed);
    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro']);
  });
});

describe('Rename an open group', () => {
  it('changes the name in Chrome and in the proposal that extends it; a current proposal stays current', async () => {
    generator();
    const [pasta] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const cucina = await strip.addGroup('Cucina', 'orange', [pasta!]);
    await organizer.propose(W);

    const state = await organizer.renameGroup(cucina, '  Ricette  ');

    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Ricette']);
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
    expect(state.proposal!.groups.filter((g) => g.existingGroupId === cucina).map((g) => g.name)).toEqual(['Ricette']);
  });

  it('an open group that is a category also renames the category (description, color and sites are kept)', async () => {
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

  it('a proposal group that is a category also renames the category and stays "list"', async () => {
    generator();
    await organizer.propose(W);

    const state = await organizer.edit({ kind: 'rename', groupId: await groupId('Lavoro'), name: 'Ufficio' });

    expect(state.proposal!.groups.map((g) => [g.name, g.provenance])).toContainEqual(['Ufficio', 'list']);
    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Ufficio']);
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
  });

  it('does not rename a category to the name of another (nor to an empty one): nothing changes and it says so', async () => {
    await saveSettings({ categories: [{ id: 'w', name: 'Lavoro', description: 'Lavoro', color: 'blue' }, { id: 's', name: 'Studio', description: '', color: 'red' }] });
    const [, , mail] = (await browser.tabs.query({ windowId: W })).map((t) => t.id!);
    const lavoro = await strip.addGroup('Lavoro', 'blue', [mail!]);

    const state = await organizer.renameGroup(lavoro, 'studio');
    await organizer.renameGroup(lavoro, '  ');

    expect(state.notice).toEqual({ key: 'categoryNameDuplicate' });
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Lavoro']);
    expect((await loadSettings()).categories.map((c) => c.name)).toEqual(['Lavoro', 'Studio']);
  });

  it('a group that no longer exists changes nothing', async () => {
    const before = await organizer.state();

    expect(await organizer.renameGroup(9999, 'Nuovo')).toEqual(before);
  });
});

describe('Examples for the description', () => {
  it('never sends the AI browser pages or excluded-domain pages of an open group', async () => {
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
