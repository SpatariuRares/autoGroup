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

/** Tre tab di a.com e una copia della prima: una proposta con un gruppo e un doppione. */
function setUp() {
  const a1 = strip.addTab({ url: 'https://a.com/1', title: 'A1' });
  const a2 = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  const a3 = strip.addTab({ url: 'https://a.com/3', title: 'A3' });
  const copy = strip.addTab({ url: 'https://a.com/1', title: 'A1 copia' });
  return { a1, a2, a3, copy };
}

describe('proposta scaduta', () => {
  it('una tab aperta nel browser rende la proposta scaduta', async () => {
    setUp();
    await organizer.propose(W);

    strip.addTab({ url: 'https://b.com/', title: 'B' });

    expect((await organizer.checkStale()).stale).toBe(true);
  });

  it('una tab chiusa nel browser la rende scaduta; chiusa dal pannello no', async () => {
    const { a2, a3 } = setUp();
    await organizer.propose(W);

    await organizer.closeTab(a2);
    expect((await organizer.checkStale()).stale).toBeUndefined();

    await strip.closeTab(a3);
    expect((await organizer.checkStale()).stale).toBe(true);
  });

  it('"Chiudi doppioni" non la rende scaduta, anche se una tab scelta non era più un doppione', async () => {
    const { a1, copy } = setUp();
    await organizer.propose(W);
    // La prima copia sparisce: "A1 copia" non è più un doppione e resta aperta.
    await organizer.closeTab(a1);

    await organizer.closeDuplicates(W, [copy]);

    expect(strip.layout()).toEqual(['A2', 'A3', 'A1 copia']);
    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it("chiudere un gruppo aperto dal pannello non la rende scaduta", async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const lavoro = await strip.addGroup('Lavoro', 'blue', [d1]);
    setUp();
    await organizer.propose(W);

    await organizer.closeGroup(lavoro);

    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it('spostare una tab nella barra non la rende scaduta', async () => {
    const { a3 } = setUp();
    await organizer.propose(W);

    await browser.tabs.move(a3, { index: 0 });

    expect(strip.layout()[0]).toBe('A3');
    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it('impostazioni cambiate la rendono scaduta; il nuovo calcolo la rende di nuovo attuale', async () => {
    setUp();
    await organizer.propose(W);

    await saveSettings({ minTabs: 3 });
    expect((await organizer.checkStale()).stale).toBe(true);

    const state = await organizer.propose(W, { force: true });
    expect(state.stale).toBeUndefined();
    expect((await organizer.checkStale()).stale).toBeUndefined();
  });

  it('torna attuale se le tab tornano come prima, e riaprendo il pannello la proposta è riusata', async () => {
    setUp();
    const proposed = await organizer.propose(W);
    await saveSettings({ minTabs: 3 });
    await organizer.checkStale();

    await saveSettings({ minTabs: 2 });

    expect((await organizer.checkStale()).stale).toBeUndefined();
    expect((await createOrganizer().propose(W)).proposal).toEqual(proposed.proposal);
  });

  it('senza proposta non segna nulla', async () => {
    setUp();
    const before = await organizer.state();

    strip.addTab({ url: 'https://b.com/', title: 'B' });

    expect(await organizer.checkStale()).toEqual(before);
  });

  it('dopo "Applica" le tab cambiate non segnano nulla', async () => {
    setUp();
    await organizer.propose(W);
    await organizer.apply();

    strip.addTab({ url: 'https://b.com/', title: 'B' });

    expect((await organizer.checkStale()).stale).toBeUndefined();
  });
});
