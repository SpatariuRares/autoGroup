import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const DAY = 86_400_000;
/** Moment `days` days ago, for `lastAccessed`. */
const ago = (days: number) => Date.now() - days * DAY;

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ mode: 'domain', excludedDomains: ['banca.it'] });
});

/** The tabs the panel shows as inactive, by title. */
async function inactiveInView() {
  return (await organizer.view(W)).inactive.map((t) => t.title);
}

/** All the inactive tabs chosen: like pressing "Close" without unticking any. */
async function inactiveIds() {
  return (await organizer.view(W)).inactive.map((t) => t.tabId);
}

describe('inactive tabs', () => {
  it('closes the tabs not looked at for at least 7 days, even if in a group, and keeps the others', async () => {
    strip.addTab({ url: 'https://a.com/', title: 'Vecchia', lastAccessed: ago(10) });
    strip.addTab({ url: 'https://b.com/', title: 'Recente', lastAccessed: ago(2) });
    const grouped = strip.addTab({ url: 'https://c.com/', title: 'Vecchia nel gruppo', lastAccessed: ago(30) });
    const other = strip.addTab({ url: 'https://d.com/', title: 'Recente nel gruppo', lastAccessed: ago(1) });
    await strip.addGroup('Mio', 'blue', [grouped, other]);
    strip.addTab({ url: 'https://e.com/', title: 'Senza data' });

    expect(await inactiveInView()).toEqual(['Vecchia', 'Vecchia nel gruppo']);
    await organizer.closeInactive(W, await inactiveIds());

    expect(strip.layout()).toEqual(['Recente', 'Recente nel gruppo [Mio]', 'Senza data']);
  });

  it('does not touch pinned, active or audible tabs, excluded domains, browser pages and other windows', async () => {
    strip.addTab({ url: 'https://a.com/', title: 'Fissata', pinned: true, lastAccessed: ago(20) });
    strip.addTab({ url: 'https://b.com/', title: 'Attiva', active: true, lastAccessed: ago(20) });
    strip.addTab({ url: 'https://c.com/', title: 'Musica', audible: true, lastAccessed: ago(20) });
    strip.addTab({ url: 'https://banca.it/', title: 'Banca', lastAccessed: ago(20) });
    strip.addTab({ url: 'chrome://settings/', title: 'Impostazioni', lastAccessed: ago(20) });
    strip.addTab({ url: 'https://d.com/', title: 'Altra finestra', windowId: 2, lastAccessed: ago(20) });

    expect(await inactiveInView()).toEqual([]);
    await organizer.closeInactive(W, [...(await browser.tabs.query({})).map((t) => t.id!)]);

    expect(strip.layout()).toEqual(['Fissata', 'Attiva', 'Musica', 'Banca', 'Impostazioni']);
    expect(strip.layout(2)).toEqual(['Altra finestra']);
  });

  it('closes only the tabs chosen in the preview', async () => {
    const keep = strip.addTab({ url: 'https://a.com/', title: 'Da tenere', lastAccessed: ago(9) });
    strip.addTab({ url: 'https://b.com/', title: 'Da chiudere', lastAccessed: ago(9) });

    await organizer.closeInactive(W, (await inactiveIds()).filter((id) => id !== keep));

    expect(strip.layout()).toEqual(['Da tenere']);
  });

  it('the proposal stays current, without the closed tabs', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://a.com/3', title: 'A3 vecchia', lastAccessed: ago(8) });
    const before = await organizer.propose(W);
    expect(before.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['A1', 'A2', 'A3 vecchia']);

    const after = await organizer.closeInactive(W, await inactiveIds());

    expect(after.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['A1', 'A2']);
    expect((await organizer.propose(W)).proposal!.createdAt).toBe(after.proposal!.createdAt);
  });
});

describe('close group', () => {
  it('closes all the tabs of an open group and no other', async () => {
    const a = strip.addTab({ url: 'https://a.com/', title: 'A' });
    const b = strip.addTab({ url: 'https://b.com/', title: 'B' });
    strip.addTab({ url: 'https://c.com/', title: 'C libera' });
    const d = strip.addTab({ url: 'https://d.com/', title: 'D' });
    const group = await strip.addGroup('Da chiudere', 'red', [a, b]);
    await strip.addGroup('Resta', 'blue', [d]);

    await organizer.closeGroup(group);

    expect(strip.layout()).toEqual(['C libera', 'D [Resta]']);
  });

  it('the tabs the proposal added to the group become free again and the proposal stays current', async () => {
    const work = strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const group = await strip.addGroup('a.com', 'blue', [work]);
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    const before = await organizer.propose(W);
    expect(before.proposal!.groups.map((g) => [g.name, g.existingGroupId])).toEqual([
      ['a.com', group],
      ['b.com', undefined],
    ]);

    const after = await organizer.closeGroup(group);

    expect(after.proposal!.groups.map((g) => g.name)).toEqual(['b.com']);
    expect((await organizer.propose(W)).proposal!.createdAt).toBe(after.proposal!.createdAt);
    await organizer.apply();
    expect(strip.layout()).toEqual(['A2', 'B1 [b.com]', 'B2 [b.com]']);
  });

  it('a group that no longer exists closes nothing', async () => {
    strip.addTab({ url: 'https://a.com/', title: 'A' });

    await organizer.closeGroup(9999);

    expect(strip.layout()).toEqual(['A']);
  });
});
