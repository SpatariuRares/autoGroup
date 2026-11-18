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
  await saveSettings({ mode: 'domain', excludedDomains: ['banca.it'] });
});

/** The duplicate tabs as the panel shows them, by title. */
async function duplicatesInView() {
  return (await organizer.view(W)).duplicates.map((t) => t.title);
}

/** The tabs the panel shows as duplicates, all chosen: like pressing "Close" without unticking any. */
async function duplicateIds() {
  return (await organizer.view(W)).duplicates.map((t) => t.tabId);
}

describe('duplicate tabs', () => {
  it('closes the free copies of the same page and keeps the first; the fragment does not count, the parameters do', async () => {
    strip.addTab({ url: 'https://a.com/doc', title: 'Doc' });
    strip.addTab({ url: 'https://b.com/', title: 'B' });
    strip.addTab({ url: 'https://a.com/doc#sezione', title: 'Doc copia' });
    strip.addTab({ url: 'https://a.com/doc?v=2', title: 'Doc v2' });
    strip.addTab({ url: 'https://a.com/doc', title: 'Doc copia 2' });

    expect(await duplicatesInView()).toEqual(['Doc copia', 'Doc copia 2']);
    await organizer.closeDuplicates(W, await duplicateIds());

    expect(strip.layout()).toEqual(['Doc', 'B', 'Doc v2']);
  });

  it('keeps the pinned or grouped copy and never closes pinned or grouped tabs', async () => {
    strip.addTab({ url: 'https://a.com/', title: 'A libera' });
    strip.addTab({ url: 'https://a.com/', title: 'A fissata', pinned: true });
    const grouped = strip.addTab({ url: 'https://b.com/', title: 'B nel gruppo' });
    await strip.addGroup('Mio', 'blue', [grouped]);
    strip.addTab({ url: 'https://b.com/', title: 'B libera' });
    const g2 = strip.addTab({ url: 'https://b.com/', title: 'B in un altro gruppo' });
    await strip.addGroup('Altro', 'red', [g2]);

    await organizer.closeDuplicates(W, await duplicateIds());

    const titles = (await browser.tabs.query({ windowId: W })).map((t) => t.title).sort();
    expect(titles).toEqual(['A fissata', 'B in un altro gruppo', 'B nel gruppo']);
  });

  it('does not touch excluded domains, browser pages and other windows', async () => {
    strip.addTab({ url: 'https://banca.it/conto', title: 'Banca' });
    strip.addTab({ url: 'https://banca.it/conto', title: 'Banca copia' });
    strip.addTab({ url: 'chrome://settings/', title: 'Impostazioni' });
    strip.addTab({ url: 'chrome://settings/', title: 'Impostazioni copia' });
    strip.addTab({ url: 'https://a.com/', title: 'A' });
    strip.addTab({ url: 'https://a.com/', title: 'A altra finestra', windowId: 2 });

    expect(await duplicatesInView()).toEqual([]);
    await organizer.closeDuplicates(W, await duplicateIds());

    expect(strip.layout()).toEqual(['Banca', 'Banca copia', 'Impostazioni', 'Impostazioni copia', 'A']);
    expect(strip.layout(2)).toEqual(['A altra finestra']);
  });

  it('the proposal stays current, without the closed tabs', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://a.com/1', title: 'A1 copia' });
    const before = await organizer.propose(W);
    expect(before.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['A1', 'A2', 'A1 copia']);

    const after = await organizer.closeDuplicates(W, await duplicateIds());

    expect(after.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['A1', 'A2']);
    // Reopening the panel reuses the proposal (same date), without a new computation.
    expect((await organizer.propose(W)).proposal!.createdAt).toBe(after.proposal!.createdAt);
  });

  it('closes only the duplicates chosen in the preview and ignores the tabs that are not duplicates', async () => {
    const original = strip.addTab({ url: 'https://a.com/', title: 'A' });
    const keep = strip.addTab({ url: 'https://a.com/', title: 'A copia tenuta' });
    const close = strip.addTab({ url: 'https://a.com/', title: 'A copia chiusa' });
    const other = strip.addTab({ url: 'https://b.com/', title: 'B' });
    expect(await duplicateIds()).toEqual([keep, close]);

    await organizer.closeDuplicates(W, [close, other, original]);

    expect(strip.layout()).toEqual(['A', 'A copia tenuta', 'B']);
  });
});
