import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { loadSettings, saveApiKey, saveSettings } from '../src/settings';
import type { Category, OrganizerState } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';
import { HANG, httpError, installFakeFetch, installFakePermissions, openAiReply, systemOneReply, type RecordedRequest } from './fake-network';
import { installFakeScripting } from './fake-scripting';
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

describe('site rules, per-site mode', () => {
  it('site tabs go to their category, the others by domain, with distinct colors', async () => {
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

  it('the most specific rule wins', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/torvalds/linux', title: 'Linux' });
    strip.addTab({ url: 'https://github.com/mia-org/b', title: 'Org B' });
    strip.addTab({ url: 'https://gist.github.com/x', title: 'Gist' });

    expect(summary(await organizer.propose(W))).toEqual([
      { name: 'Work', provenance: 'list', color: 'blue', tabs: ['Org A', 'Org B'] },
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Linux', 'Gist'] },
    ]);
  });

  it('a category below the minimum does not form the group: the tab stays free, it does not go into its domain\'s group', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/altro', title: 'Altro' });
    strip.addTab({ url: 'https://github.com/altro2', title: 'Altro 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Altro', 'Altro 2'] }]);
  });

  it('an open group with the category\'s name also receives a single tab', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    const open = await strip.addGroup('dev', 'pink', [mine]);
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });

    const { proposal } = await organizer.propose(W);

    expect(proposal!.groups).toMatchObject([{ name: 'dev', color: 'pink', provenance: 'existing', existingGroupId: open, tabs: [{ title: 'Repo' }] }]);
  });

  it('rules follow the category even if it is renamed', async () => {
    await saveSettings({ categories: CATEGORIES.map((c) => (c.id === 'dev' ? { ...c, name: 'Codice' } : c)) });
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Codice', provenance: 'list', color: 'grey', tabs: ['Repo 1', 'Repo 2'] }]);
  });

  it('a tab moved by the user loses the rule indication', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/2', title: 'HN 2' });
    const { proposal } = await organizer.propose(W);
    const [dev, hn] = proposal!.groups;

    const state = await organizer.edit({ kind: 'move-tab', tabId: dev!.tabs[0]!.tabId, toGroupId: hn!.id });

    expect(state.proposal!.groups.find((g) => g.id === hn!.id)!.tabs.at(-1)).not.toHaveProperty('rule');
  });

  it('changing the sites makes a saved proposal no longer current', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const first = await organizer.propose(W);

    await saveSettings({ categorySites: { dev: ['github.com', 'gitlab.com'] } });
    const second = await organizer.propose(W);

    expect(second.proposal!.signature).not.toBe(first.proposal!.signature);
  });
});

const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };
const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };

async function aiMode(extra: Parameters<typeof saveSettings>[0] = {}) {
  await saveSettings({ mode: 'ai', generator: OPENROUTER, ...extra });
  await saveApiKey('generator', 'sk-test');
}

/** Titles of the tabs sent to the Generator in a request. */
const sentTitles = (request: RecordedRequest) => JSON.parse(request.body.messages[1].content).tabs.map((t: { title: string }) => t.title);

describe('site rules, AI mode', () => {
  it('only the tabs no rule has taken reach the AI; groups with the same name are merged', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://stackoverflow.com/q/1', title: 'Domanda' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch(openAiReply({ groups: [{ name: 'Dev', tabs: ['t2'] }, { name: 'Cucina', tabs: ['t3', 't4'] }] }));

    const state = await organizer.propose(W);

    expect(sentTitles(requests[0]!)).toEqual(['Domanda', 'Pasta', 'Pizza']);
    expect(summary(state)).toEqual([
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo', 'Domanda'] },
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Pasta', 'Pizza'] },
    ]);
  });

  it('ignores the ID of a rule tab if the AI uses it anyway', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    installFakeFetch(openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2', 't3'] }] }));

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([{ name: 'Cucina', provenance: 'ai', color: 'grey', tabs: ['Pasta', 'Pizza'] }]);
  });

  it('if all tabs are taken by rules it does not query the AI and does not show the preview', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const { fetchMock } = installFakeFetch(new Error('nessuna richiesta attesa'));
    const announced: OrganizerState[] = [];
    organizer = createOrganizer({ onStateChange: (s) => announced.push(s) });

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(announced.some((s) => s.preview)).toBe(false);
    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toEqual([{ name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo 1', 'Repo 2'] }]);
  });

  it('the per-site preview already contains the rule groups, and "Use this" keeps them', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch(HANG);
    const announced: OrganizerState[] = [];
    organizer = createOrganizer({ onStateChange: (s) => announced.push(s) });

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const names = announced.at(-1)!.preview!.groups.map((g) => g.name);
    await organizer.acceptPreview();
    const state = await running;

    expect(names).toEqual(['Dev', 'cucina.it']);
    expect(state.proposal!.groups.map((g) => g.name)).toEqual(['Dev', 'cucina.it']);
  });

  it('if the AI does not respond the fallback is rules + domain', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    installFakeFetch(httpError(401));

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'invalid-key' }]);
    expect(state.proposal!.groups.map((g) => [g.name, g.provenance])).toEqual([
      ['Dev', 'list'],
      ['cucina.it', 'domain'],
    ]);
  });

  it('Classifier: the rule tabs count toward the minimum and never go to the Generator', async () => {
    await aiMode({ classifier: KEV });
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://stackoverflow.com/q/1', title: 'Domanda' });
    strip.addTab({ url: 'https://github.com/mia-org/x', title: 'Org' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch((request: RecordedRequest) => {
      if (request.url.endsWith('/v1/systemone')) {
        const choice = request.body.state.title === 'Domanda' ? 'Dev' : 'none_of_the_above';
        return systemOneReply({ group: { choice, confidence: 0.9 } });
      }
      const tabs = JSON.parse(request.body.messages[1].content).tabs as { id: string }[];
      return openAiReply({ groups: [{ name: 'Cucina', tabs: tabs.map((t) => t.id) }] });
    });

    const state = await organizer.propose(W);

    const classified = requests.filter((r) => r.url.endsWith('/v1/systemone')).map((r) => r.body.state.title);
    expect(classified.sort()).toEqual(['Domanda', 'Pasta', 'Pizza']);
    const generated = requests.filter((r) => !r.url.endsWith('/v1/systemone')).flatMap(sentTitles);
    expect(generated).toEqual(['Pasta', 'Pizza']);
    // "Org" (Work) stays below the minimum: free, not passed to the Generator.
    expect(summary(state)).toEqual([
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo', 'Domanda'] },
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Pasta', 'Pizza'] },
    ]);
  });

  it('does not read the description of pages taken by rules', async () => {
    installFakePermissions(['https://openrouter.ai/*', '<all_urls>']);
    await aiMode({ readDescriptions: true });
    const repo = strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    const pasta = strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    const { read } = installFakeScripting(new Map([[repo, { description: 'R' }], [pasta, { description: 'P' }]]));
    installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).toEqual([pasta]);
  });
});

const NONE = { preset: 'none', baseUrl: '', model: '' };

describe('site rules, "With rules" mode (no provider)', () => {
  it('applies only the rules: the other tabs stay free even if from the same domain', async () => {
    await saveSettings({ mode: 'ai', generator: NONE, classifier: NONE });
    strip.addTab({ url: 'https://mail.google.com/mail/u/0', title: 'Posta' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://calendar.google.com/r', title: 'Calendario' });
    strip.addTab({ url: 'https://news.ycombinator.com/item?id=1', title: 'HN 2' });
    const { requests } = installFakeFetch();

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([{ name: 'Google', provenance: 'list', color: 'green', tabs: ['Posta', 'Calendario'] }]);
    expect(state.proposal!.warnings).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('a category below the minimum does not form the group, but a single tab joins the open group with the same name', async () => {
    await saveSettings({ mode: 'ai', generator: NONE, classifier: NONE });
    const open = strip.addTab({ url: 'https://example.com/', title: 'Altro' });
    await strip.addGroup('Dev', 'cyan', [open]);
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://mail.google.com/', title: 'Posta' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Dev', provenance: 'existing', color: 'cyan', tabs: ['Repo'] }]);
  });

  it('with Gemini Nano chosen, the per-domain fallback remains', async () => {
    await saveSettings({ mode: 'ai', generator: { preset: 'nano', baseUrl: '', model: '' }, classifier: NONE });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/item?id=1', title: 'HN 2' });

    expect(summary(await organizer.propose(W)).map((g) => g.provenance)).toEqual(['domain']);
  });
});

describe('Always put here', () => {
  it('remembers the tab\'s domain in the category of its group, and the proposal stays current', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const gitlab = strip.addTab({ url: 'https://www.gitlab.com/x', title: 'GitLab' });
    const { proposal } = await organizer.propose(W);
    const dev = proposal!.groups.find((g) => g.name === 'Dev')!;
    await organizer.edit({ kind: 'add-tab', tab: { tabId: gitlab, title: 'GitLab', url: 'https://www.gitlab.com/x' }, to: { groupId: dev.id } });

    const state = await organizer.rememberSite(gitlab);

    expect((await loadSettings()).categorySites).toEqual({ ...SITES, dev: ['github.com', 'gitlab.com'] });
    expect(state.notice).toEqual({ key: 'panelSiteRemembered', arg: ['gitlab.com', 'Dev'] });
    expect(state.proposal!.groups.find((g) => g.id === dev.id)!.tabs.find((t) => t.tabId === gitlab)!.rule).toBe('gitlab.com');
    // Reopening the panel, the modified proposal stays.
    expect((await organizer.propose(W)).proposal).toEqual(state.proposal);
  });

  it('moves out of its category the site that currently decides the tab', async () => {
    const orgA = strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/mia-org/b', title: 'Org B' });
    strip.addTab({ url: 'https://github.com/x', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/y', title: 'Repo 2' });
    const { proposal } = await organizer.propose(W);
    const dev = proposal!.groups.find((g) => g.name === 'Dev')!;
    await organizer.edit({ kind: 'move-tab', tabId: orgA, toGroupId: dev.id });

    const state = await organizer.rememberSite(orgA);

    expect((await loadSettings()).categorySites).toEqual({ dev: ['github.com', 'github.com/mia-org'], google: SITES.google });
    expect(state.notice).toEqual({ key: 'panelSiteMoved', arg: ['github.com/mia-org', 'Work', 'Dev'] });
  });

  it('after "Move to…" toward a category it offers to remember the site; the offer applies only to that answer', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const gitlab = strip.addTab({ url: 'https://www.gitlab.com/x', title: 'GitLab' });
    const { proposal } = await organizer.propose(W);
    const dev = proposal!.groups.find((g) => g.name === 'Dev')!;

    const state = await organizer.edit({ kind: 'add-tab', tab: { tabId: gitlab, title: 'GitLab', url: 'https://www.gitlab.com/x' }, to: { groupId: dev.id } });

    expect(state.offer).toEqual({ tabId: gitlab, site: 'gitlab.com', category: 'Dev' });
    expect((await organizer.state()).offer).toBeUndefined();
  });

  it('no offer when moving toward a group that is not a category', async () => {
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/2', title: 'HN 2' });
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const { proposal } = await organizer.propose(W);
    const hn = proposal!.groups.find((g) => g.name === 'news.ycombinator.com')!;

    const state = await organizer.edit({ kind: 'add-tab', tab: { tabId: solo, title: 'Solo', url: 'https://solo.com/' }, to: { groupId: hn.id } });

    expect(state.proposal!.groups.find((g) => g.id === hn.id)!.tabs.map((t) => t.title)).toEqual(['HN 1', 'HN 2', 'Solo']);
    expect(state.offer).toBeUndefined();
  });

  it('does nothing for groups that are not a category', async () => {
    const hn = strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/2', title: 'HN 2' });
    const before = await organizer.propose(W);

    const state = await organizer.rememberSite(hn);

    expect(state).toEqual(before);
    expect((await loadSettings()).categorySites).toEqual(SITES);
  });
});
