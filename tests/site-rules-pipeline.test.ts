import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import type { Category, OrganizerState } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';
import { installFakePermissions } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const CATEGORIES: Category[] = [
  { id: 'dev', name: 'Dev', description: 'Programmazione', color: 'grey' },
  { id: 'work', name: 'Work', description: 'Lavoro', color: 'blue' },
  { id: 'google', name: 'Google', description: 'Servizi Google', color: 'green' },
];
const SITES = { dev: ['github.com'], work: ['github.com/mia-org'], google: ['mail.google.com', 'calendar.google.com'] };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*', 'http://127.0.0.1/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ mode: 'domain', categories: CATEGORIES, categorySites: SITES });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = (state: OrganizerState) =>
  state.proposal!.groups.map((g) => ({ name: g.name, provenance: g.provenance, color: g.color, tabs: g.tabs.map((t) => t.title) }));

describe('regole sui siti, modalità per sito', () => {
  it('le tab dei siti vanno nella loro categoria, le altre per dominio, con colori distinti', async () => {
    strip.addTab({ url: 'https://mail.google.com/mail/u/0', title: 'Posta' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://calendar.google.com/r', title: 'Calendario' });
    strip.addTab({ url: 'https://news.ycombinator.com/item?id=1', title: 'HN 2' });

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([
      { name: 'Google', provenance: 'list', color: 'green', tabs: ['Posta', 'Calendario'] },
      { name: 'news.ycombinator.com', provenance: 'domain', color: 'grey', tabs: ['HN 1', 'HN 2'] },
    ]);
    expect(state.proposal!.groups[0]!.tabs.map((t) => t.rule)).toEqual(['mail.google.com', 'calendar.google.com']);
    expect(state.proposal!.groups[1]!.tabs.map((t) => t.rule)).toEqual([undefined, undefined]);
  });

  it('vince la regola più specifica', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/torvalds/linux', title: 'Linux' });
    strip.addTab({ url: 'https://github.com/mia-org/b', title: 'Org B' });
    strip.addTab({ url: 'https://gist.github.com/x', title: 'Gist' });

    expect(summary(await organizer.propose(W))).toEqual([
      { name: 'Work', provenance: 'list', color: 'blue', tabs: ['Org A', 'Org B'] },
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Linux', 'Gist'] },
    ]);
  });

  it('una categoria sotto il minimo non forma il gruppo: la tab resta libera, non va nel gruppo del suo dominio', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/altro', title: 'Altro' });
    strip.addTab({ url: 'https://github.com/altro2', title: 'Altro 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Altro', 'Altro 2'] }]);
  });

  it('un gruppo aperto con il nome della categoria riceve anche una sola tab', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    const open = await strip.addGroup('dev', 'pink', [mine]);
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });

    const { proposal } = await organizer.propose(W);

    expect(proposal!.groups).toMatchObject([{ name: 'dev', color: 'pink', provenance: 'existing', existingGroupId: open, tabs: [{ title: 'Repo' }] }]);
  });

  it('le regole seguono la categoria anche se viene rinominata', async () => {
    await saveSettings({ categories: CATEGORIES.map((c) => (c.id === 'dev' ? { ...c, name: 'Codice' } : c)) });
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Codice', provenance: 'list', color: 'grey', tabs: ['Repo 1', 'Repo 2'] }]);
  });

  it('una tab spostata dall\'utente perde l\'indicazione della regola', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/2', title: 'HN 2' });
    const { proposal } = await organizer.propose(W);
    const [dev, hn] = proposal!.groups;

    const state = await organizer.edit({ kind: 'move-tab', tabId: dev!.tabs[0]!.tabId, toGroupId: hn!.id });

    expect(state.proposal!.groups.find((g) => g.id === hn!.id)!.tabs.at(-1)).not.toHaveProperty('rule');
  });

  it('cambiare i siti rende non più attuale una proposta salvata', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const first = await organizer.propose(W);

    await saveSettings({ categorySites: { dev: ['github.com', 'gitlab.com'] } });
    const second = await organizer.propose(W);

    expect(second.proposal!.signature).not.toBe(first.proposal!.signature);
  });
});
