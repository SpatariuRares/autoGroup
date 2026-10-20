import { t } from '../../src/shared/i18n';
import type { ExistingGroupView, Proposal, ProposalEdit, ProposedTab, WindowView } from '../../src/shared/types';

/**
 * Una voce di "Sposta in…": `value` la distingue tra le opzioni del menu, `move` sposta la tab. Cosa
 * fa dipende da dove sta la tab: dentro la proposta è una modifica della proposta, fuori sposta
 * davvero la tab nella barra.
 */
export interface Target {
  value: string;
  label: string;
  move: (tab: ProposedTab) => void;
}

/** Su e giù di un posto nella barra: l'alternativa al trascinamento, dal menu "Sposta in…". */
export interface Reorder {
  up: boolean;
  down: boolean;
  onMove: (direction: 'up' | 'down') => void;
}

/**
 * Su e Giù per l'elemento `i` di `ids` (nell'ordine della barra): Su va prima del precedente, Giù
 * prima di quello che segue il successivo, o in fondo (`null`).
 */
export function reorderAt(ids: number[], i: number, move: (beforeId: number | null) => void): Reorder {
  return {
    up: i > 0,
    down: i < ids.length - 1,
    onMove: (direction) => move(direction === 'up' ? ids[i - 1]! : (ids[i + 2] ?? null)),
  };
}

/** Come lo spostamento arriva all'Organizzatore. */
export interface Moves {
  edit: (change: Extract<ProposalEdit, { kind: 'add-tab' }>) => void;
  groupTab: (tabId: number, groupId: number) => void;
  newGroup: (tabId: number) => void;
  moveTab: (tabId: number, groupId: number | null, beforeTabId: number | null) => void;
}

const unnamed = (name: string) => name || t('popupUnnamed');
const newGroup = (move: Target['move']): Target => ({ value: 'n', label: t('panelNewGroup'), move });
const openGroup = (e: ExistingGroupView, move: Target['move']): Target => ({ value: `c:${e.group.id}`, label: unnamed(e.group.name), move });

/**
 * Le destinazioni di "Sposta in…", per ogni tipo di tab del pannello. "Nuovo gruppo" è sempre l'ultima.
 * - `proposed`: per le tab della proposta. I gruppi della proposta, i gruppi aperti che la proposta non
 *   tocca ancora e un gruppo nuovo, tranne il gruppo dove la tab sta già (`except`).
 * - `free`: per le tab senza gruppo. Con una proposta come sopra; senza, e non durante il calcolo, le
 *   mettono subito in un gruppo aperto o in uno nuovo.
 * - `live`: per le tab di adesso di un gruppo aperto, solo quando si può trascinare (`live`): un altro
 *   gruppo aperto, uno nuovo o fuori dal gruppo.
 */
export function moveTargets({ proposal, view, computing, live, moves }: { proposal?: Proposal; view: WindowView; computing: boolean; live: boolean; moves: Moves }) {
  const proposed = (except: { proposedGroupId?: string; openGroupId?: number } = {}): Target[] =>
    proposal
      ? [
          ...proposal.groups
            .filter((g) => g.id !== except.proposedGroupId)
            .map((g) => ({ value: `p:${g.id}`, label: unnamed(g.name), move: (tab: ProposedTab) => moves.edit({ kind: 'add-tab', tab, to: { groupId: g.id } }) })),
          ...view.existing
            .filter((e) => !e.proposedGroupId && e.group.id !== except.openGroupId)
            .map((e) => openGroup(e, (tab) => moves.edit({ kind: 'add-tab', tab, to: { existingGroup: e.group } }))),
          newGroup((tab) => moves.edit({ kind: 'add-tab', tab, to: { newGroup: true } })),
        ]
      : [];

  const direct: Target[] =
    !proposal && !computing
      ? [...view.existing.map((e) => openGroup(e, (tab) => moves.groupTab(tab.tabId, e.group.id))), newGroup((tab) => moves.newGroup(tab.tabId))]
      : [];

  const inGroup = (groupId: number): Target[] =>
    live
      ? [
          ...view.existing.filter((e) => e.group.id !== groupId).map((e) => openGroup(e, (tab) => moves.moveTab(tab.tabId, e.group.id, null))),
          newGroup((tab) => moves.newGroup(tab.tabId)),
          { value: 'f', label: t('panelUngroupTab'), move: (tab) => moves.moveTab(tab.tabId, null, null) },
        ]
      : [];

  return { proposed, free: proposal ? proposed() : direct, live: inGroup };
}
