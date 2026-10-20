import { browser } from 'wxt/browser';
import type { Organizer } from '../organizer';
import type { OrganizerState } from './types';

/**
 * L'Organizzatore come lo vedono il pannello e le altre pagine: gli stessi metodi, ognuno un messaggio
 * al service worker. `autoGroupTab` e `checkStale` restano al service worker, che li chiama dai suoi eventi.
 */
export type RemoteOrganizer = Omit<Organizer, 'autoGroupTab' | 'checkStale'>;
type Method = keyof RemoteOrganizer;

/** I metodi chiamabili, anche a runtime: il compilatore li tiene allineati all'interfaccia. */
const METHODS: Record<Method, true> = {
  state: true,
  propose: true,
  edit: true,
  saveToList: true,
  saveOpenGroupToList: true,
  renameGroup: true,
  rememberSite: true,
  apply: true,
  undo: true,
  closeTab: true,
  closeDuplicates: true,
  closeInactive: true,
  closeGroup: true,
  groupTab: true,
  newGroup: true,
  sortGroups: true,
  sortTabs: true,
  moveTab: true,
  moveGroup: true,
  abort: true,
  acceptPreview: true,
  view: true,
};

interface OrganizerCall {
  type: 'organizer/call';
  method: Method;
  args: unknown[];
}

/** Notifica dal service worker alle pagine aperte quando lo stato cambia. */
interface StateChanged {
  type: 'organizer/state-changed';
  state: OrganizerState;
}

type CallResponse = { ok: true; value: unknown } | { ok: false; error: string };

function isCall(message: unknown): message is OrganizerCall {
  const m = message as Partial<OrganizerCall> | null;
  return typeof m === 'object' && m !== null && m.type === 'organizer/call' && Object.hasOwn(METHODS, m.method ?? '') && Array.isArray(m.args);
}

async function call(method: Method, args: unknown[]): Promise<unknown> {
  const response = (await browser.runtime.sendMessage({ type: 'organizer/call', method, args } satisfies OrganizerCall)) as CallResponse | undefined;
  if (!response) throw new Error('Nessuna risposta dal service worker');
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

/** Lato pagina: l'Organizzatore del service worker. Un errore nel service worker diventa un'eccezione qui. */
export const remoteOrganizer = Object.fromEntries(
  Object.keys(METHODS).map((method) => [method, (...args: unknown[]) => call(method as Method, args)]),
) as unknown as RemoteOrganizer;

/**
 * Lato service worker: risponde alle chiamate delle pagine con `organizer`. Ignora gli altri messaggi
 * e i metodi che non sono in `RemoteOrganizer`. Risponde con `sendResponse` + `return true`, che
 * funziona in tutte le versioni di Chrome MV3. Restituisce la funzione per smettere.
 */
export function serveOrganizer(organizer: RemoteOrganizer): () => void {
  const listener = (message: unknown, _sender: unknown, sendResponse: (response: CallResponse) => void) => {
    if (!isCall(message)) return;
    const method = organizer[message.method] as (...args: unknown[]) => Promise<unknown>;
    Reflect.apply(method, organizer, message.args)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}

/** Lato service worker: annuncia il nuovo stato. Se nessuna pagina è aperta l'errore è atteso. */
export function announceState(state: OrganizerState): void {
  browser.runtime.sendMessage({ type: 'organizer/state-changed', state } satisfies StateChanged).catch(() => {});
}

/** Lato pagina: ascolta i cambi di stato annunciati dal service worker. Restituisce la funzione per smettere. */
export function onOrganizerState(listener: (state: OrganizerState) => void): () => void {
  const handler = (message: StateChanged) => {
    if (message?.type === 'organizer/state-changed') listener(message.state);
  };
  browser.runtime.onMessage.addListener(handler);
  return () => browser.runtime.onMessage.removeListener(handler);
}
