import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { panelModel, type PanelInput } from '../entrypoints/sidepanel/panel-model';
import type { OrganizerState, Proposal, ProposedTab, WindowView } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
});

const W = 1;
const tab = (tabId: number): ProposedTab => ({ tabId, title: `Tab ${tabId}`, url: `https://a.com/${tabId}` });
const proposal = (groups = 1): Proposal => ({
  windowId: W,
  createdAt: 0,
  signature: 's',
  groups: Array.from({ length: groups }, (_, i) => ({ id: `g${i}`, name: `G${i}`, color: 'blue' as const, provenance: 'domain' as const, tabs: [tab(i)] })),
  warnings: [],
});
const EMPTY: WindowView = { existing: [], created: [], free: [], held: [], duplicates: [], inactive: [], inactiveDays: 7, live: {} };

function model(state: OrganizerState | null, input: Partial<PanelInput> = {}) {
  return panelModel({ state, windowId: W, view: EMPTY, failure: null, done: null, ...input });
}

describe('panel: phases and banners', () => {
  it('the banners appear in fixed order: error, outdated, AI warnings, duplicates, inactive', () => {
    const ready: OrganizerState = {
      phase: 'ready',
      windowId: W,
      stale: true,
      error: 'errorApply',
      proposal: { ...proposal(), warnings: [{ level: 'generator', provider: 'X', cause: 'timeout' }] },
    };
    const view = { ...EMPTY, created: ready.proposal.groups, duplicates: [tab(8)], inactive: [tab(9), tab(10)] };

    const { banners, announcement } = model(ready, { view });

    expect(banners.map((b) => b.kind)).toEqual(['error', 'stale', 'warnings', 'duplicates', 'inactive']);
    expect(announcement).toBe(
      "Le tab sono cambiate dopo questa proposta. Una tab è il doppione di un'altra già aperta. 2 tab non aperte da almeno 7 giorni.",
    );
  });

  it("during the computation the per-site preview is read-only and duplicates and inactive wait", () => {
    const view = { ...EMPTY, duplicates: [tab(8)], inactive: [tab(9)] };

    const computing = model({ phase: 'computing', windowId: W, preview: proposal() }, { view });

    expect(computing).toMatchObject({ computing: true, readOnly: true, proposal: undefined, banners: [] });
    expect(computing.announcement).toBe("Intanto, la proposta per sito: l'AI sta calcolando…");
    expect(model({ phase: 'computing', windowId: W }, { view })).toMatchObject({ readOnly: false, announcement: 'Calcolo della proposta…' });
  });

  it("without a proposal the outcome becomes a banner; the one of \"Add to categories\" never does", () => {
    expect(model({ phase: 'idle', windowId: W, notice: { key: 'popupAborted' } }).banners).toEqual([
      { kind: 'info', text: 'Calcolo interrotto: nessuna proposta. Premi «Ricalcola» per riprovare.' },
    ]);
    expect(model({ phase: 'idle', windowId: W }, { done: 'popupApplied' }).banners).toEqual([{ kind: 'info', text: 'Gruppi creati.' }]);

    const saved = model({ phase: 'ready', windowId: W, proposal: proposal(), notice: { key: 'saveToListSaved', arg: 'Cucina', snackbar: true } }, {
      view: { ...EMPTY, created: proposal().groups },
    });
    expect(saved).toMatchObject({ banners: [], notice: undefined });
  });

  it("another window's state shows neither its proposal nor its \"Undo\"", () => {
    const other = model({ phase: 'ready', windowId: 2, proposal: { ...proposal(), windowId: 2 }, undo: { windowId: 2, tabs: [], createdGroupIds: [] } });

    expect(other).toMatchObject({ proposal: undefined, canUndo: false, banners: [] });
  });
});
