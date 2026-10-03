import { browser } from 'wxt/browser';
import type { OrganizerRequest, OrganizerResponse, StateChangedMessage } from './messages';
import type { OrganizerState } from './types';

/** Lato popup: invia una richiesta all'Organizzatore nel service worker. */
export async function callOrganizer(request: OrganizerRequest): Promise<OrganizerState> {
  const response = (await browser.runtime.sendMessage(request)) as OrganizerResponse | undefined;
  if (!response) throw new Error('Nessuna risposta dal service worker');
  if (!response.ok) throw new Error(response.error);
  return response.state;
}

/** Lato popup: ascolta i cambi di stato annunciati dal service worker. */
export function onOrganizerState(listener: (state: OrganizerState) => void): () => void {
  const handler = (message: StateChangedMessage) => {
    if (message?.type === 'organizer/state-changed') listener(message.state);
  };
  browser.runtime.onMessage.addListener(handler);
  return () => browser.runtime.onMessage.removeListener(handler);
}
