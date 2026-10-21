import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../src/settings';
import { onOrganizerState, remoteOrganizer as organizer } from '../../src/shared/organizer-remote';
import type { OrganizerState, ProposalEdit, WindowView } from '../../src/shared/types';
import { useExpiring } from '../../src/ui/use-expiring';
import { layoutOf, withMotion } from './motion';

/**
 * Lo stato dell'Organizzatore per la finestra del pannello. All'apertura lo legge soltanto, senza
 * calcolare: una proposta già fatta per questa finestra si rivede, una nuova parte solo da
 * "Organizza". Poi segue gli aggiornamenti del service worker, solo quelli di questa finestra.
 */
export function useOrganizer() {
  const [state, setState] = useState<OrganizerState | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Letta dall'ascoltatore: l'annuncio dell'anteprima può arrivare prima che React aggiorni `windowId`.
  const currentWindow = useRef<number | null>(null);

  useEffect(() => {
    // Lo stato è unico per tutte le finestre: si mostrano solo gli aggiornamenti di questa.
    return onOrganizerState((next) => {
      if (currentWindow.current !== null && next.windowId === currentWindow.current) setState(next);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const win = await browser.windows.getCurrent();
      currentWindow.current = win.id!;
      setWindowId(win.id!);
      setState(await organizer.state());
    })().catch((err) => {
      console.error(err);
      setState({ phase: 'idle', error: 'errorUnexpected' });
    });
  }, []);

  /**
   * Operazione che blocca i pulsanti finché non finisce: sulla proposta intera, sulla finestra o lunga
   * (Organizza, Applica, Annulla, A-Z, Aggiungi alle categorie).
   */
  async function run(request: () => Promise<OrganizerState>, after?: () => void) {
    setBusy(true);
    setFailure(null);
    try {
      setState(await request());
      after?.();
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Richiesta senza attesa visibile, per le azioni su una tab o un gruppo che finiscono subito (modifiche,
   * chiudere, spostare): il nuovo stato, o `null` se fallisce (con l'errore mostrato).
   */
  async function send(request: () => Promise<OrganizerState>): Promise<OrganizerState | null> {
    setFailure(null);
    try {
      const next = await request();
      setState(next);
      return next;
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
      return null;
    }
  }

  const edit = (change: ProposalEdit) => send(() => organizer.edit(change));

  return { state, windowId, busy, failure, run, send, edit };
}

const EMPTY_VIEW: WindowView = { existing: [], created: [], free: [], held: [], duplicates: [], inactive: [], inactiveDays: 0, live: {} };

/**
 * La finestra come la costruisce l'Organizzatore (vedi `Organizer.view`), riletta a ogni cambio di
 * tab o gruppi della finestra, di stato o di impostazioni. Una risposta arrivata dopo una più nuova
 * viene scartata. Se la proposta è vecchia lo dice lo stato (`stale`), non la vista.
 */
export function useWindowView(windowId: number | null, state: OrganizerState | null, settings: Settings | null) {
  const [view, setView] = useState<WindowView>(EMPTY_VIEW);
  const [changes, setChanges] = useState(0);
  // Si anima solo il passaggio da una vista già mostrata a una con le cose in altri posti.
  const layout = useRef<string | null>(null);

  useEffect(() => {
    if (windowId === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setChanges((n) => n + 1), 100);
    };
    const inWindow = (x?: { windowId?: number }) => x?.windowId === windowId && changed();
    const onRemoved = (_id: number, info: { windowId: number }) => inWindow(info);
    const onUpdated = (_id: number, _change: unknown, tab: { windowId?: number }) => inWindow(tab);
    const onMoved = (_id: number, info: { windowId: number }) => inWindow(info);
    const onMovedBetween = (_id: number, info: { newWindowId?: number; oldWindowId?: number }) =>
      (info.newWindowId === windowId || info.oldWindowId === windowId) && changed();

    browser.tabs.onCreated.addListener(inWindow);
    browser.tabs.onRemoved.addListener(onRemoved);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onActivated.addListener(inWindow);
    browser.tabs.onMoved.addListener(onMoved);
    browser.tabs.onAttached.addListener(onMovedBetween);
    browser.tabs.onDetached.addListener(onMovedBetween);
    browser.tabGroups.onCreated.addListener(inWindow);
    browser.tabGroups.onUpdated.addListener(inWindow);
    browser.tabGroups.onRemoved.addListener(inWindow);
    return () => {
      clearTimeout(timer);
      browser.tabs.onCreated.removeListener(inWindow);
      browser.tabs.onRemoved.removeListener(onRemoved);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onActivated.removeListener(inWindow);
      browser.tabs.onMoved.removeListener(onMoved);
      browser.tabs.onAttached.removeListener(onMovedBetween);
      browser.tabs.onDetached.removeListener(onMovedBetween);
      browser.tabGroups.onCreated.removeListener(inWindow);
      browser.tabGroups.onUpdated.removeListener(inWindow);
      browser.tabGroups.onRemoved.removeListener(inWindow);
    };
  }, [windowId]);

  useEffect(() => {
    if (windowId === null) return;
    let latest = true;
    organizer
      .view(windowId)
      .then((next) => {
        if (!latest) return;
        const before = layout.current;
        layout.current = layoutOf(next);
        if (before !== null && before !== layout.current) withMotion(() => setView(next));
        else setView(next);
      })
      .catch((err) => console.error('autoGroup:', err));
    return () => {
      latest = false;
    };
  }, [windowId, state, settings, changes]);

  return view;
}

/** Per quanto resta visibile una snackbar con un esito o un'offerta. */
export const SNACKBAR_MS = 8000;

/** Dopo quanto il segno di categoria sparisce se la vista non cambia (es. categoria già esistente). */
const ADDED_MARK_MS = 1500;

/**
 * "Aggiungi alle categorie": il gruppo (`adding.id`, della proposta o di Chrome) mostra subito il segno
 * di categoria e la snackbar dice che si sta salvando. Finito il salvataggio si aspetta la vista nuova,
 * così il segno non torna indietro. L'esito (`saved`) resta nella snackbar per qualche secondo.
 */
export function useSaveToCategories(run: ReturnType<typeof useOrganizer>['run'], view: WindowView) {
  const [adding, setAdding] = useState<{ id: string | number; name: string; done: boolean } | null>(null);
  const [saved, setSaved, pauseSaved] = useExpiring<NonNullable<OrganizerState['notice']>>(SNACKBAR_MS);

  useEffect(() => {
    if (adding?.done) setAdding(null);
  }, [view]);
  useEffect(() => {
    if (!adding?.done) return;
    const timer = setTimeout(() => setAdding(null), ADDED_MARK_MS);
    return () => clearTimeout(timer);
  }, [adding?.done]);

  const save = async (id: string | number, name: string, request: () => Promise<OrganizerState>) => {
    setAdding({ id, name, done: false });
    setSaved(null);
    await run(async () => {
      const next = await request();
      // Anche un errore delle impostazioni (es. troppe categorie) arriva come esito.
      if (next.notice) setSaved(next.notice);
      return next;
    });
    setAdding((a) => a && { ...a, done: true });
  };

  return { adding, saved, pauseSaved, save };
}

export { useExpiring };
