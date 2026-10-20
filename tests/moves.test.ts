import { beforeEach, describe, expect, it } from 'vitest';
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

const open = (title: string, extra: { pinned?: boolean; windowId?: number } = {}) => strip.addTab({ url: `https://${title.toLowerCase()}.com/`, title, ...extra });

/** Barra di prova: fissata, A (a1 a2 a3), libera x, B (b1 b2), libera y. */
async function setup() {
  const ids: Record<string, number> = {};
  for (const t of ['P', 'a1', 'a2', 'a3', 'x', 'b1', 'b2', 'y']) ids[t] = open(t, { pinned: t === 'P' });
  const A = await strip.addGroup('A', 'blue', [ids.a1!, ids.a2!, ids.a3!]);
  const B = await strip.addGroup('B', 'red', [ids.b1!, ids.b2!]);
  return { ids, A, B };
}

describe('drag and drop di una tab', () => {
  it('la riordina dentro il suo gruppo, verso sinistra, verso destra e in fondo', async () => {
    const { ids, A } = await setup();

    await organizer.moveTab(ids.a3!, A, ids.a1!);
    expect(strip.groupsIn()[0]!.tabs).toEqual(['a3', 'a1', 'a2']);
    await organizer.moveTab(ids.a3!, A, ids.a2!);
    expect(strip.groupsIn()[0]!.tabs).toEqual(['a1', 'a3', 'a2']);
    await organizer.moveTab(ids.a1!, A, null);
    expect(strip.groupsIn()[0]!.tabs).toEqual(['a3', 'a2', 'a1']);
  });

  it('la mette in un altro gruppo, prima di una sua tab o in fondo', async () => {
    const { ids, B } = await setup();

    await organizer.moveTab(ids.a2!, B, ids.b2!);
    await organizer.moveTab(ids.a1!, B, null);

    expect(strip.layout()).toEqual(['P', 'a3 [A]', 'x', 'b1 [B]', 'a2 [B]', 'b2 [B]', 'a1 [B]', 'y']);
  });

  it('la toglie dal gruppo, prima di una tab senza gruppo o dopo l\'ultima', async () => {
    const { ids } = await setup();

    await organizer.moveTab(ids.b1!, null, ids.x!);
    await organizer.moveTab(ids.a1!, null, null);

    expect(strip.layout()).toEqual(['P', 'a2 [A]', 'a3 [A]', 'b1', 'x', 'b2 [B]', 'y', 'a1']);
  });

  it('una tab senza gruppo entra in un gruppo o si riordina tra le libere', async () => {
    const { ids, A } = await setup();

    await organizer.moveTab(ids.x!, null, null);
    await organizer.moveTab(ids.y!, A, ids.a2!);

    expect(strip.layout()).toEqual(['P', 'a1 [A]', 'y [A]', 'a2 [A]', 'a3 [A]', 'b1 [B]', 'b2 [B]', 'x']);
  });

  it('ignora le tab fissate, una destinazione fuori dal gruppo di arrivo e gruppi di altre finestre', async () => {
    const { ids, A } = await setup();
    const other = open('z', { windowId: 2 });
    const C = await strip.addGroup('C', 'green', [other]);
    const before = strip.layout();

    await organizer.moveTab(ids.P!, A, null);
    await organizer.moveTab(ids.x!, A, ids.b1!);
    await organizer.moveTab(ids.x!, C, null);
    await organizer.moveTab(ids.a1!, A, ids.a1!);

    expect(strip.layout()).toEqual(before);
    expect(strip.layout(2)).toEqual(['z [C]']);
  });
});

describe('una tab che esce dal suo gruppo, come in Chrome', () => {
  // Visto in Chrome vero: la prima tab resta prima del gruppo, le altre finiscono subito dopo.
  it('"Nuovo gruppo" sulla prima tab la lascia prima del gruppo, su un\'altra la mette dopo', async () => {
    const { ids } = await setup();

    await organizer.newGroup(ids.a1!);
    await organizer.newGroup(ids.a3!);

    expect(strip.layout()).toEqual(['P', 'a1 [a1.com]', 'a2 [A]', 'a3 [a3.com]', 'x', 'b1 [B]', 'b2 [B]', 'y']);
  });

  it('l\'unica tab di un gruppo resta dov\'è', async () => {
    const { ids } = await setup();
    await organizer.newGroup(ids.b1!);

    await organizer.newGroup(ids.b2!);

    expect(strip.layout()).toEqual(['P', 'a1 [A]', 'a2 [A]', 'a3 [A]', 'x', 'b1 [b1.com]', 'b2 [b2.com]', 'y']);
  });
});

describe('drag and drop di un gruppo', () => {
  it('lo sposta intero prima di un altro gruppo, verso sinistra', async () => {
    const { B, A } = await setup();

    await organizer.moveGroup(B, A);

    expect(strip.layout()).toEqual(['P', 'b1 [B]', 'b2 [B]', 'a1 [A]', 'a2 [A]', 'a3 [A]', 'x', 'y']);
  });

  it('verso destra e dopo l\'ultimo gruppo, senza entrare in un altro gruppo', async () => {
    const { A } = await setup();
    const c = [open('c1'), open('c2')];
    const C = await strip.addGroup('C', 'green', c);

    await organizer.moveGroup(A, C);
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['B', 'A', 'C']);
    await organizer.moveGroup(A, null);
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['B', 'C', 'A']);
    expect(strip.groupsIn().map((g) => g.tabs)).toEqual([['b1', 'b2'], ['c1', 'c2'], ['a1', 'a2', 'a3']]);
    expect(strip.layout()[0]).toBe('P');
    expect(strip.layout().filter((t) => !t.includes('['))).toEqual(['P', 'x', 'y']);
  });

  it('prima di sé stesso o del gruppo che lo segue non cambia nulla', async () => {
    const { A, B } = await setup();
    const before = strip.layout();

    await organizer.moveGroup(A, A);
    await organizer.moveGroup(A, B);
    await organizer.moveGroup(B, null);

    expect(strip.layout()).toEqual(before);
  });
});
