import type { OrganizerState, ProposalEdit } from './types';

/** Richieste dal popup al service worker. L'Organizzatore è l'unico destinatario. */
export type OrganizerRequest =
  | { type: 'organizer/state' }
  | { type: 'organizer/propose'; windowId: number; force?: boolean }
  | { type: 'organizer/edit'; edit: ProposalEdit }
  | { type: 'organizer/apply' }
  | { type: 'organizer/undo' };

/** Notifica dal service worker al popup quando lo stato cambia. */
export interface StateChangedMessage {
  type: 'organizer/state-changed';
  state: OrganizerState;
}

export type OrganizerResponse = { ok: true; state: OrganizerState } | { ok: false; error: string };

const REQUEST_TYPES = new Set<string>([
  'organizer/state',
  'organizer/propose',
  'organizer/edit',
  'organizer/apply',
  'organizer/undo',
] satisfies OrganizerRequest['type'][]);

export function isOrganizerRequest(message: unknown): message is OrganizerRequest {
  return typeof message === 'object' && message !== null && REQUEST_TYPES.has((message as { type?: string }).type ?? '');
}
