import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { layoutOf } from '../entrypoints/sidepanel/motion';
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

describe('pannello: fasi e banner', () => {
  it('i banner compaiono in ordine fisso: errore, superata, avvisi AI, doppioni, inattive', () => {
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

  it("durante il calcolo l'anteprima per sito è in sola lettura e doppioni e inattive aspettano", () => {
    const view = { ...EMPTY, duplicates: [tab(8)], inactive: [tab(9)] };

    const computing = model({ phase: 'computing', windowId: W, preview: proposal() }, { view });

    expect(computing).toMatchObject({ computing: true, readOnly: true, proposal: undefined, banners: [] });
    expect(computing.announcement).toBe("Intanto, la proposta per sito: l'AI sta calcolando…");
    expect(model({ phase: 'computing', windowId: W }, { view })).toMatchObject({ readOnly: false, announcement: 'Calcolo della proposta…' });
  });

  it("senza proposta l'esito diventa un banner; quello di \"Aggiungi alle categorie\" mai", () => {
    expect(model({ phase: 'idle', windowId: W, notice: { key: 'popupAborted' } }).banners).toEqual([
      { kind: 'info', text: 'Calcolo interrotto: nessuna proposta. Premi «Ricalcola» per riprovare.' },
    ]);
    expect(model({ phase: 'idle', windowId: W }, { done: 'popupApplied' }).banners).toEqual([{ kind: 'info', text: 'Gruppi creati.' }]);

    const saved = model({ phase: 'ready', windowId: W, proposal: proposal(), notice: { key: 'saveToListSaved', arg: 'Cucina', snackbar: true } }, {
      view: { ...EMPTY, created: proposal().groups },
    });
    expect(saved).toMatchObject({ banners: [], notice: undefined });
  });

  it("lo stato di un'altra finestra non mostra né la sua proposta né il suo \"Annulla\"", () => {
    const other = model({ phase: 'ready', windowId: 2, proposal: { ...proposal(), windowId: 2 }, undo: { windowId: 2, tabs: [], createdGroupIds: [] } });

    expect(other).toMatchObject({ proposal: undefined, canUndo: false, banners: [] });
  });
});

describe('pannello: quando animare', () => {
  const view = (free: number[], extra: Partial<WindowView> = {}): WindowView => ({ ...EMPTY, free: free.map(tab), ...extra });

  it('un titolo, un\'icona o i dettagli dal vivo nuovi non cambiano la disposizione', () => {
    const renamed = view([1, 2], { free: [{ ...tab(1), title: 'Altro', favIconUrl: 'x.png' }, tab(2)], live: { 1: { active: true, audible: false, muted: true } } });
    expect(layoutOf(renamed)).toBe(layoutOf(view([1, 2])));
  });

  it('una tab che cambia posto, sezione o se ne va cambia la disposizione', () => {
    const start = layoutOf(view([1, 2]));
    expect(layoutOf(view([2, 1]))).not.toBe(start);
    expect(layoutOf(view([1]))).not.toBe(start);
    const grouped = view([2], { created: [{ id: 'g0', name: 'G', color: 'blue', provenance: 'manual', tabs: [tab(1)] }] });
    expect(layoutOf(grouped)).not.toBe(start);
  });
});
