import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../src/settings';
import { onOrganizerState, remoteOrganizer as organizer } from '../../src/shared/organizer-remote';
import type { OrganizerState, ProposalEdit, WindowView } from '../../src/shared/types';

/**
 * Lo stato dell'Organizzatore per la finestra del pannello. All'apertura chiede la proposta;
 * poi segue gli aggiornamenti del service worker, solo quelli di questa finestra.
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
      setState(await organizer.propose(win.id!));
    })().catch((err) => {
      console.error(err);
      setState({ phase: 'idle', error: 'errorPropose' });
    });
  }, []);

  /** Operazione che blocca i pulsanti finché non finisce (Applica, Annulla, Ricalcola…). */
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

  /** Richiesta senza attesa visibile: il nuovo stato, o `null` se fallisce (con l'errore mostrato). */
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
      .then((next) => latest && setView(next))
      .catch((err) => console.error('autoGroup:', err));
    return () => {
      latest = false;
    };
  }, [windowId, state, settings, changes]);

  return view;
}

export { useExpiring } from '../../src/ui/use-expiring';
