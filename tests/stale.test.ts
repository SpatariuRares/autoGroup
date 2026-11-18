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

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ mode: 'domain' });
});

/** Three tabs of a.com and a copy of the first: a proposal with a group and a duplicate. */
function setUp() {
  const a1 = strip.addTab({ url: 'https://a.com/1', title: 'A1' });
  const a2 = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  const a3 = strip.addTab({ url: 'https://a.com/3', title: 'A3' });
  const copy = strip.addTab({ url: 'https://a.com/1', title: 'A1 copia' });
  return { a1, a2, a3, copy };
}

describe('stale proposal', () => {
  it('a tab opened in the browser makes the proposal stale', async () => {
    setUp();
    await organizer.propose(W);

    strip.addTab({ url: 'https://b.com/', title: 'B' });

    expect((await organizer.checkStale()).stale).toBe(true);
  });

  it('a tab closed in the browser makes it stale; closed from the panel does not', async () => {
    const { a2, a3 } = setUp();
    await organizer.propose(W);

    await organizer.closeTab(a2);
    expect((await organizer.checkStale()).stale).toBeUndefined();

    await strip.closeTab(a3);
    expect((await organizer.checkStale()).stale).toBe(true);
  });

  it('"Close duplicates" does not make it stale, even if a chosen tab was no longer a duplicate', async () => {
    const { a1, copy } = setUp();
    await organizer.propose(W);
    // The first copy disappears: "A1 copia" is no longer a duplicate and stays open.
    await organizer.closeTab(a1);

    await organizer.closeDuplicates(W, [copy]);

    expect(strip.layout()).toEqual(['A2', 'A3', 'A1 copia']);
    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it("closing an open group from the panel does not make it stale", async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const lavoro = await strip.addGroup('Lavoro', 'blue', [d1]);
    setUp();
    await organizer.propose(W);

    await organizer.closeGroup(lavoro);

    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it('moving a tab in the bar does not make it stale', async () => {
    const { a3 } = setUp();
    await organizer.propose(W);

    await browser.tabs.move(a3, { index: 0 });

    expect(strip.layout()[0]).toBe('A3');
    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it('changed settings make it stale; the new computation makes it current again', async () => {
    setUp();
    await organizer.propose(W);

    await saveSettings({ minTabs: 3 });
    expect((await organizer.checkStale()).stale).toBe(true);

    const state = await organizer.propose(W, { force: true });
    expect(state.stale).toBeUndefined();
    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it('becomes current again if the tabs return as before, and reopening the panel reuses the proposal', async () => {
    setUp();
    const proposed = await organizer.propose(W);
    await saveSettings({ minTabs: 3 });
    await organizer.checkStale();

    await saveSettings({ minTabs: 2 });

    expect((await organizer.checkStale()).stale).toBeUndefined();
    expect((await createOrganizer().propose(W)).proposal).toEqual(proposed.proposal);
  });

  it('without a proposal marks nothing', async () => {
    setUp();
    const before = await organizer.state();

    strip.addTab({ url: 'https://b.com/', title: 'B' });

    expect(await organizer.checkStale()).toEqual(before);
  });

  it('after "Apply" the changed tabs mark nothing', async () => {
    setUp();
    await organizer.propose(W);
    await organizer.apply();

    strip.addTab({ url: 'https://b.com/', title: 'B' });

    expect((await organizer.checkStale()).stale).toBeUndefined();
  });
});
