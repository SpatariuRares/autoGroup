import type { OrganizerState, ProposalEdit } from './types';

/** Richieste dal pannello al service worker. L'Organizzatore è l'unico destinatario. */
export type OrganizerRequest =
  | { type: 'organizer/state' }
  | { type: 'organizer/propose'; windowId: number; force?: boolean }
  | { type: 'organizer/edit'; edit: ProposalEdit }
  | { type: 'organizer/save-to-list'; groupId: string }
  | { type: 'organizer/apply' }
  | { type: 'organizer/abort' }
  | { type: 'organizer/undo' }
  | { type: 'organizer/close-tab'; tabId: number };

/** Notifica dal service worker al pannello quando lo stato cambia. */
export interface StateChangedMessage {
  type: 'organizer/state-changed';
  state: OrganizerState;
}

export type OrganizerResponse = { ok: true; state: OrganizerState } | { ok: false; error: string };

const REQUEST_TYPES = new Set<string>([
  'organizer/state',
  'organizer/propose',
  'organizer/edit',
  'organizer/save-to-list',
  'organizer/apply',
  'organizer/abort',
  'organizer/undo',
  'organizer/close-tab',
] satisfies OrganizerRequest['type'][]);

export function isOrganizerRequest(message: unknown): message is OrganizerRequest {
  return typeof message === 'object' && message !== null && REQUEST_TYPES.has((message as { type?: string }).type ?? '');
}
