import { createContext, useContext } from 'react';
import type { ExistingGroupRef, ProposalEdit, ProposedGroup } from '../../src/shared/types';

/**
 * Le azioni di schede e righe sull'Organizzatore, date da `App` a tutto il pannello senza passarle di
 * mano in mano. Le azioni che non toccano la proposta (andare a una tab, audio, comprimere un gruppo)
 * vanno direttamente a Chrome, vedi `tab-actions.ts`.
 */
export interface PanelActions {
  /** Vero mentre un'operazione che blocca i pulsanti è in corso. */
  busy: boolean;
  edit: (change: ProposalEdit) => void;
  closeTab: (tabId: number) => void;
  closeGroup: (groupId: number) => void;
  renameGroup: (groupId: number, name: string) => void;
  /** Sposta davvero una tab nella barra: in un gruppo aperto (o fuori, `null`), prima di `beforeTabId` o in fondo. */
  moveTab: (tabId: number, groupId: number | null, beforeTabId: number | null) => void;
  /** "Aggiungi alle categorie" per un gruppo della proposta o per un gruppo aperto. */
  saveProposedGroup: (group: ProposedGroup) => void;
  saveOpenGroup: (group: ExistingGroupRef) => void;
  /** Il gruppo che "Aggiungi alle categorie" sta salvando: ID della proposta (testo) o di Chrome (numero). */
  adding: string | number | null;
}

export const PanelActionsContext = createContext<PanelActions | null>(null);

export function usePanelActions(): PanelActions {
  const actions = useContext(PanelActionsContext);
  if (!actions) throw new Error('usePanelActions fuori da PanelActionsContext');
  return actions;
}
