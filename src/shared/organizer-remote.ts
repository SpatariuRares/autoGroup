import { browser } from 'wxt/browser';
import type { Organizer } from '../organizer';
import type { OrganizerState } from './types';

/**
 * The Organizer as the panel and the other pages see it: the same methods, each one a message
 * to the service worker. `autoGroupTab` and `checkStale` stay in the service worker, which calls them from its events.
 */
export type RemoteOrganizer = Omit<Organizer, 'autoGroupTab' | 'checkStale'>;
type Method = keyof RemoteOrganizer;

/** The callable methods, also at runtime: the compiler keeps them aligned with the interface. */
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

/** Notification from the service worker to the open pages when the state changes. */
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
  if (!response) throw new Error('No response from the service worker');
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

/** Page side: the service worker's Organizer. An error in the service worker becomes an exception here. */
export const remoteOrganizer = Object.fromEntries(
  Object.keys(METHODS).map((method) => [method, (...args: unknown[]) => call(method as Method, args)]),
) as unknown as RemoteOrganizer;

/**
 * Service worker side: answers the pages' calls with `organizer`. Ignores the other messages
 * and the methods that are not in `RemoteOrganizer`. Answers with `sendResponse` + `return true`, which
 * works in all versions of Chrome MV3. Returns the function to stop listening.
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

/** Service worker side: announces the new state. If no page is open the error is expected. */
export function announceState(state: OrganizerState): void {
  browser.runtime.sendMessage({ type: 'organizer/state-changed', state } satisfies StateChanged).catch(() => {});
}

/** Page side: listens to the state changes announced by the service worker. Returns the function to stop listening. */
export function onOrganizerState(listener: (state: OrganizerState) => void): () => void {
  const handler = (message: StateChanged) => {
    if (message?.type === 'organizer/state-changed') listener(message.state);
  };
  browser.runtime.onMessage.addListener(handler);
  return () => browser.runtime.onMessage.removeListener(handler);
}
