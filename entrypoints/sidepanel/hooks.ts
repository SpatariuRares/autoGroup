import { useEffect, useRef, useState } from 'react';
import { browser, type Browser } from 'wxt/browser';
import { loadSettings, type Settings } from '../../src/settings';
import { callOrganizer, onOrganizerState } from '../../src/shared/organizer-client';
import type { OrganizerState, ProposalEdit } from '../../src/shared/types';

type OrganizerRequest = Parameters<typeof callOrganizer>[0];

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
      setState(await callOrganizer({ type: 'organizer/propose', windowId: win.id! }));
    })().catch((err) => {
      console.error(err);
      setState({ phase: 'idle', error: 'errorPropose' });
    });
  }, []);

  /** Operazione che blocca i pulsanti finché non finisce (Applica, Annulla, Ricalcola…). */
  async function run(request: OrganizerRequest, after?: () => void) {
    setBusy(true);
    setFailure(null);
    try {
      setState(await callOrganizer(request));
      after?.();
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
    } finally {
      setBusy(false);
    }
  }

  /** Richiesta senza attesa visibile: il nuovo stato, o `null` se fallisce (con l'errore mostrato). */
  async function send(request: OrganizerRequest): Promise<OrganizerState | null> {
    setFailure(null);
    try {
      const next = await callOrganizer(request);
      setState(next);
      return next;
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
      return null;
    }
  }

  const edit = (change: ProposalEdit) => send({ type: 'organizer/edit', edit: change });

  return { state, setState, windowId, busy, failure, run, send, edit };
}

/**
 * Tab e gruppi della finestra letti dal vivo, per mostrare tutta la finestra e non solo la proposta.
 * `onChange` scatta solo per i cambi che rendono vecchia una proposta (tab aperte, chiuse, spostate,
 * URL, fissaggio, gruppi creati, tolti, rinominati o ricolorati), non per titoli, favicon, audio,
 * tab attiva o gruppi compressi. Riceve la tab chiusa o il gruppo sparito, se è quello il cambio.
 */
export function useWindowSnapshot(windowId: number | null, onChange: (closedTabId?: number, removedGroupId?: number) => void) {
  const [snapshot, setSnapshot] = useState<{ tabs: Browser.tabs.Tab[]; groups: Browser.tabGroups.TabGroup[] }>({ tabs: [], groups: [] });
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    if (windowId === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Nome e colore dei gruppi all'ultima lettura: comprimere un gruppo non cambia la proposta.
    const known = new Map<number, string>();
    const look = (group: { title?: string; color: string }) => `${group.title ?? ''}|${group.color}`;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const [tabs, groups] = await Promise.all([browser.tabs.query({ windowId }), browser.tabGroups.query({ windowId })]);
        for (const group of groups) known.set(group.id, look(group));
        setSnapshot({ tabs, groups });
      }, 100);
    };
    const structural = (closedTabId?: number, removedGroupId?: number) => {
      changed.current(closedTabId, removedGroupId);
      refresh();
    };
    const inWindow = (x?: { windowId?: number }) => x?.windowId === windowId;
    const onCreated = (tab: { windowId?: number }) => inWindow(tab) && structural();
    const onRemoved = (id: number, info: { windowId: number }) => info.windowId === windowId && structural(id);
    const onUpdated = (_id: number, change: { url?: string; pinned?: boolean; groupId?: number }, tab: { windowId?: number }) => {
      if (!inWindow(tab)) return;
      if (change.url !== undefined || change.pinned !== undefined || change.groupId !== undefined) structural();
      else refresh();
    };
    const onActivated = (info: { windowId: number }) => info.windowId === windowId && refresh();
    const onMovedBetween = (_id: number, info: { newWindowId?: number; oldWindowId?: number }) =>
      (info.newWindowId === windowId || info.oldWindowId === windowId) && structural();
    const onMoved = (_id: number, info: { windowId: number }) => info.windowId === windowId && refresh();
    const onGroup = (group: { windowId?: number }) => inWindow(group) && structural();
    const onGroupUpdated = (group: Browser.tabGroups.TabGroup) => {
      if (!inWindow(group)) return;
      if (known.get(group.id) === look(group)) refresh();
      else structural();
    };
    const onGroupRemoved = (group: Browser.tabGroups.TabGroup) => inWindow(group) && structural(undefined, group.id);

    refresh();
    browser.tabs.onCreated.addListener(onCreated);
    browser.tabs.onRemoved.addListener(onRemoved);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onMoved.addListener(onMoved);
    browser.tabs.onAttached.addListener(onMovedBetween);
    browser.tabs.onDetached.addListener(onMovedBetween);
    browser.tabGroups.onCreated.addListener(onGroup);
    browser.tabGroups.onUpdated.addListener(onGroupUpdated);
    browser.tabGroups.onRemoved.addListener(onGroupRemoved);
    return () => {
      clearTimeout(timer);
      browser.tabs.onCreated.removeListener(onCreated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onMoved.removeListener(onMoved);
      browser.tabs.onAttached.removeListener(onMovedBetween);
      browser.tabs.onDetached.removeListener(onMovedBetween);
      browser.tabGroups.onCreated.removeListener(onGroup);
      browser.tabGroups.onUpdated.removeListener(onGroupUpdated);
      browser.tabGroups.onRemoved.removeListener(onGroupRemoved);
    };
  }, [windowId]);

  return snapshot;
}

/** Impostazioni lette dal vivo: il selettore della modalità e il riepilogo dei provider le seguono. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const reload = () => loadSettings().then(setSettings);
    reload();
    const onChanged = (_changes: unknown, area: string) => area === 'sync' && reload();
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);
  return settings;
}

export { useExpiring } from '../../src/ui/use-expiring';
