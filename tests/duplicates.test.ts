import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { buildWindowView } from '../src/organizer/window-view';
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

/** Le tab duplicate come le mostra il pannello, per titolo. */
async function duplicatesInView() {
  const tabs = await browser.tabs.query({ windowId: W });
  const view = buildWindowView(tabs, await browser.tabGroups.query({ windowId: W }), undefined, ['banca.it']);
  return view.duplicates.map((id) => tabs.find((t) => t.id === id)!.title);
}

describe('tab duplicate', () => {
  it('chiude le copie libere della stessa pagina e tiene la prima; il frammento non conta, i parametri sì', async () => {
    strip.addTab({ url: 'https://a.com/doc', title: 'Doc' });
    strip.addTab({ url: 'https://b.com/', title: 'B' });
    strip.addTab({ url: 'https://a.com/doc#sezione', title: 'Doc copia' });
    strip.addTab({ url: 'https://a.com/doc?v=2', title: 'Doc v2' });
    strip.addTab({ url: 'https://a.com/doc', title: 'Doc copia 2' });

    expect(await duplicatesInView()).toEqual(['Doc copia', 'Doc copia 2']);
    await organizer.closeDuplicates(W);

    expect(strip.layout()).toEqual(['Doc', 'B', 'Doc v2']);
  });

  it('tiene la copia fissata o in un gruppo e non chiude mai tab fissate o raggruppate', async () => {
    strip.addTab({ url: 'https://a.com/', title: 'A libera' });
    strip.addTab({ url: 'https://a.com/', title: 'A fissata', pinned: true });
    const grouped = strip.addTab({ url: 'https://b.com/', title: 'B nel gruppo' });
    await strip.addGroup('Mio', 'blue', [grouped]);
    strip.addTab({ url: 'https://b.com/', title: 'B libera' });
    const g2 = strip.addTab({ url: 'https://b.com/', title: 'B in un altro gruppo' });
    await strip.addGroup('Altro', 'red', [g2]);

    await organizer.closeDuplicates(W);

    const titles = (await browser.tabs.query({ windowId: W })).map((t) => t.title).sort();
    expect(titles).toEqual(['A fissata', 'B in un altro gruppo', 'B nel gruppo']);
  });

  it('non tocca domini esclusi, pagine del browser e altre finestre', async () => {
    strip.addTab({ url: 'https://banca.it/conto', title: 'Banca' });
    strip.addTab({ url: 'https://banca.it/conto', title: 'Banca copia' });
    strip.addTab({ url: 'chrome://settings/', title: 'Impostazioni' });
    strip.addTab({ url: 'chrome://settings/', title: 'Impostazioni copia' });
    strip.addTab({ url: 'https://a.com/', title: 'A' });
    strip.addTab({ url: 'https://a.com/', title: 'A altra finestra', windowId: 2 });

    expect(await duplicatesInView()).toEqual([]);
    await organizer.closeDuplicates(W);

    expect(strip.layout()).toEqual(['Banca', 'Banca copia', 'Impostazioni', 'Impostazioni copia', 'A']);
    expect(strip.layout(2)).toEqual(['A altra finestra']);
  });

  it('la proposta resta attuale, senza le tab chiuse', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://a.com/1', title: 'A1 copia' });
    const before = await organizer.propose(W);
    expect(before.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['A1', 'A2', 'A1 copia']);

    const after = await organizer.closeDuplicates(W);

    expect(after.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['A1', 'A2']);
    // Riaprire il pannello riusa la proposta (stessa data), senza un nuovo calcolo.
    expect((await organizer.propose(W)).proposal!.createdAt).toBe(after.proposal!.createdAt);
  });
});
