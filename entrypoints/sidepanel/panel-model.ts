import { t } from '../../src/shared/i18n';
import { previewIn, proposalIn, type Notice, type OrganizerState, type Proposal, type ProposalWarning, type ProposedTab, type WindowView } from '../../src/shared/types';

export interface PanelInput {
  state: OrganizerState | null;
  windowId: number | null;
  view: WindowView;
  /** Error of a failed call to the service worker (i18n key). */
  failure: string | null;
  /** Outcome of "Apply" or "Cancel", shown by the panel itself. */
  done: 'popupApplied' | 'popupUndone' | null;
}

/** A banner above the groups. Those with `text` go through the live region (`announcement`). */
export type Banner =
  | { kind: 'error'; messageKey: string }
  | { kind: 'stale'; text: string }
  | { kind: 'warnings'; warnings: ProposalWarning[] }
  | { kind: 'duplicates' | 'inactive'; text: string; tabs: ProposedTab[] }
  | { kind: 'info' | 'no-groups'; text: string };

export interface PanelModel {
  proposal?: Proposal;
  /** Per-site proposal shown read-only while the AI computes. */
  preview?: Proposal;
  computing: boolean;
  readOnly: boolean;
  canUndo: boolean;
  /** Outcome of the last operation, except that of "Add to categories" (which has its own snackbar). */
  notice?: Notice;
  banners: Banner[];
  /** The text of the live region: the banners appear already full, and a new live region usually is not read. */
  announcement: string;
}

/** What the panel shows, from the Organizer's state and the window's view. */
export function panelModel({ state, windowId, view, failure, done }: PanelInput): PanelModel {
  const proposal = proposalIn(state, windowId);
  const canUndo = state?.undo !== undefined && state.undo.windowId === windowId;
  const computing = !state || state.phase === 'computing';
  const preview = previewIn(state, windowId);
  const readOnly = !proposal && preview !== undefined;

  // The outcome of "Add to categories" is in its snackbar, not in the panel.
  const notice = state?.notice?.snackbar ? undefined : state?.notice;
  const message = failure ?? state?.error;
  const info = !proposal && !computing && (notice || done) ? (notice ? t(notice.key, notice.arg) : t(done!)) : null;
  const touched = view.existing.some((e) => e.added.length > 0);

  // The banners, in the order they appear. Errors and AI warnings already have role="alert".
  const banners: Banner[] = [];
  if (message) banners.push({ kind: 'error', messageKey: message });
  // "Apply" and "Cancel" remove the proposal: no notice even if the tabs change.
  if (proposal && state?.stale === true && !computing) banners.push({ kind: 'stale', text: t('panelStale') });
  if (proposal && proposal.warnings.length > 0) banners.push({ kind: 'warnings', warnings: proposal.warnings });
  if (view.duplicates.length > 0 && !computing) {
    const text = view.duplicates.length === 1 ? t('panelDuplicatesOne') : t('panelDuplicates', String(view.duplicates.length));
    banners.push({ kind: 'duplicates', text, tabs: view.duplicates });
  }
  if (view.inactive.length > 0 && !computing) {
    const text =
      view.inactive.length === 1 ? t('panelInactiveOne', String(view.inactiveDays)) : t('panelInactive', [String(view.inactive.length), String(view.inactiveDays)]);
    banners.push({ kind: 'inactive', text, tabs: view.inactive });
  }
  if (info) banners.push({ kind: 'info', text: info });
  if (proposal && view.created.length === 0 && !touched) banners.push({ kind: 'no-groups', text: t('popupNoGroups') });

  const announced = banners.map((b) => ('text' in b ? b.text : undefined));
  const announcement = [computing && t(preview ? 'panelPreviewComputing' : 'popupComputing'), ...announced].filter(Boolean).join(' ');
  return { proposal, preview, computing, readOnly, canUndo, notice, banners, announcement };
}
