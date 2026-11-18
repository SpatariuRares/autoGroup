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

const open = (title: string, extra: { pinned?: boolean; windowId?: number } = {}) => strip.addTab({ url: `https://${title.toLowerCase().replace(/\W/g, '')}.com/`, title, ...extra });

describe('groups A-Z', () => {
  it('puts the groups in alphabetical order after the pinned tabs, those without a name at the end, the free tabs afterwards in their order', async () => {
    open('Fissata', { pinned: true });
    open('Libera 2');
    const z = [open('Z1'), open('Z2')];
    open('Libera 1');
    const noName = [open('Senza nome')];
    const a = [open('A1')];
    const m = [open('M1'), open('M2')];
    await strip.addGroup('zeta', 'blue', z);
    await strip.addGroup('', 'red', noName);
    await strip.addGroup('Alfa', 'green', a);
    await strip.addGroup('Emme', 'pink', m);

    await organizer.sortGroups(W);

    expect(strip.layout()).toEqual([
      'Fissata',
      'A1 [Alfa]',
      'M1 [Emme]',
      'M2 [Emme]',
      'Z1 [zeta]',
      'Z2 [zeta]',
      'Senza nome []',
      'Libera 2',
      'Libera 1',
    ]);
  });

  it('does not touch other windows', async () => {
    const b = [open('B', { windowId: 2 })];
    const a = [open('A', { windowId: 2 })];
    await strip.addGroup('Bi', 'blue', b);
    await strip.addGroup('A', 'red', a);

    await organizer.sortGroups(W);

    expect(strip.layout(2)).toEqual(['B [Bi]', 'A [A]']);
  });
});

describe('tabs A-Z', () => {
  it('sorts by title within each group and the free tabs among themselves, without moving groups or changing group', async () => {
    open('Fissata Z', { pinned: true });
    open('Fissata A', { pinned: true });
    open('libera c');
    const g1 = [open('Tab 10'), open('tab 2'), open('Tab 1')];
    open('Libera A');
    const g2 = [open('Solo')];
    open('Libera B');
    await strip.addGroup('Uno', 'blue', g1);
    await strip.addGroup('Due', 'red', g2);

    await organizer.sortTabs(W);

    expect(strip.layout()).toEqual([
      'Fissata Z',
      'Fissata A',
      'Libera A',
      'Tab 1 [Uno]',
      'tab 2 [Uno]',
      'Tab 10 [Uno]',
      'Libera B',
      'Solo [Due]',
      'libera c',
    ]);
  });

  it('does not make the proposal stale', async () => {
    open('B');
    open('A');
    strip.addTab({ url: 'https://x.com/2', title: 'X2' });
    strip.addTab({ url: 'https://x.com/1', title: 'X1' });
    const before = await organizer.propose(W);

    await organizer.sortTabs(W);

    expect(await organizer.checkStale()).toEqual(before);
  });
});
