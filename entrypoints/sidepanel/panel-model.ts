import { t } from '../../src/shared/i18n';
import { proposalIn, type Notice, type OrganizerState, type Proposal, type ProposalWarning, type ProposedTab, type WindowView } from '../../src/shared/types';

export interface PanelInput {
  state: OrganizerState | null;
  windowId: number | null;
  view: WindowView;
  /** Errore di una chiamata al service worker fallita (chiave i18n). */
  failure: string | null;
  /** Esito di "Applica" o "Annulla", mostrato dal pannello stesso. */
  done: 'popupApplied' | 'popupUndone' | null;
}

/** Un banner sopra i gruppi. Quelli con `text` passano dalla regione live (`announcement`). */
export type Banner =
  | { kind: 'error'; messageKey: string }
  | { kind: 'stale'; text: string }
  | { kind: 'warnings'; warnings: ProposalWarning[] }
  | { kind: 'duplicates' | 'inactive'; text: string; tabs: ProposedTab[] }
  | { kind: 'info' | 'no-groups'; text: string };

export interface PanelModel {
  proposal?: Proposal;
  /** Proposta per sito mostrata in sola lettura mentre l'AI calcola. */
  preview?: Proposal;
  computing: boolean;
  readOnly: boolean;
  canUndo: boolean;
  /** Esito dell'ultima operazione, tranne quello di "Aggiungi alle categorie" (che ha la sua snackbar). */
  notice?: Notice;
  banners: Banner[];
  /** Il testo della regione live: i banner compaiono già pieni, e una regione live nuova di solito non viene letta. */
  announcement: string;
}

/** Cosa mostra il pannello, dallo stato dell'Organizzatore e dalla vista della finestra. */
export function panelModel({ state, windowId, view, failure, done }: PanelInput): PanelModel {
  const proposal = proposalIn(state, windowId);
  const canUndo = state?.undo !== undefined && state.undo.windowId === windowId;
  const computing = !state || state.phase === 'computing';
  const preview = state?.phase === 'computing' && state.windowId === windowId ? state.preview : undefined;
  const readOnly = !proposal && preview !== undefined;

  // L'esito di "Aggiungi alle categorie" sta nella sua snackbar, non nel pannello.
  const notice = state?.notice?.snackbar ? undefined : state?.notice;
  const message = failure ?? state?.error;
  const info = !proposal && !computing && (notice || done) ? (notice ? t(notice.key, notice.arg) : t(done!)) : null;
  const touched = view.existing.some((e) => e.added.length > 0);

  // I banner, nell'ordine in cui compaiono. Errori e avvisi dell'AI hanno già role="alert".
  const banners: Banner[] = [];
  if (message) banners.push({ kind: 'error', messageKey: message });
  // "Applica" e "Annulla" tolgono la proposta: nessun avviso nemmeno se le tab cambiano.
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
