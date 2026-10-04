import { browser } from 'wxt/browser';
import type { OrganizerState } from '../shared/types';

const KEY = 'organizer';

/** Stato dell'Organizzatore in chrome.storage.session: sopravvive al pannello, non alla chiusura di Chrome. */
export async function loadState(): Promise<OrganizerState> {
  const stored = await browser.storage.session.get(KEY);
  return (stored[KEY] as OrganizerState | undefined) ?? { phase: 'idle' };
}

export async function saveState(state: OrganizerState): Promise<void> {
  await browser.storage.session.set({ [KEY]: state });
}
