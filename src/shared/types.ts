/** I 9 colori dei gruppi di tab di Chrome, nell'ordine usato per la rotazione. */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

/** Una categoria della lista fissa dell'utente. */
export interface Category {
  /** ID stabile, usato dall'interfaccia per modifiche e riordino. */
  id: string;
  name: string;
  /** Spiega all'AI cosa rientra nella categoria. */
  description: string;
  color: GroupColor;
}

/** Da dove viene un gruppo proposto. */
export type Provenance = 'list' | 'existing' | 'ai' | 'domain';

/** Una tab dentro la proposta. `tabId` è l'ID di Chrome: resta nell'estensione, non va mai all'AI. */
export interface ProposedTab {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

export interface ProposedGroup {
  /** ID stabile dentro la proposta, usato dal popup per le modifiche. */
  id: string;
  name: string;
  color: GroupColor;
  provenance: Provenance;
  /** Presente solo per i gruppi già aperti in Chrome che la proposta estende. */
  existingGroupId?: number;
  tabs: ProposedTab[];
}

/** Avviso mostrato in cima all'anteprima quando un livello della pipeline è stato saltato. */
export interface ProposalWarning {
  level: 'classifier' | 'generator';
  provider: string;
  cause:
    | 'unreachable'
    | 'invalid-key'
    | 'rate-limit'
    | 'timeout'
    | 'invalid-response'
    | 'invalid-request'
    | 'unavailable'
    | 'no-permission'
    | 'needs-download'
    | 'downloading';
}

export interface Proposal {
  windowId: number;
  createdAt: number;
  /** Impronta delle tab libere e delle impostazioni usate: serve a capire se la proposta è ancora attuale. */
  signature: string;
  groups: ProposedGroup[];
  warnings: ProposalWarning[];
}

/** Una modifica fatta dall'utente nell'anteprima. */
export type ProposalEdit =
  | { kind: 'rename'; groupId: string; name: string }
  | { kind: 'recolor'; groupId: string; color: GroupColor }
  | { kind: 'discard-group'; groupId: string }
  | { kind: 'remove-tab'; tabId: number }
  | { kind: 'move-tab'; tabId: number; toGroupId: string };

/** Foto delle tab coinvolte in un'organizzazione, scattata prima di applicarla. */
export interface UndoSnapshot {
  windowId: number;
  tabs: { tabId: number; windowId: number; index: number; groupId: number }[];
  /** Gruppi creati dall'operazione. */
  createdGroupIds: number[];
}

/** Stato dell'Organizzatore, salvato in chrome.storage.session. */
export interface OrganizerState {
  phase: 'idle' | 'computing' | 'ready';
  windowId?: number;
  proposal?: Proposal;
  /** Presente finché "Annulla ultima organizzazione" è disponibile. */
  undo?: UndoSnapshot;
  /** Chiave i18n dell'ultimo errore, se il calcolo o l'applicazione sono falliti. */
  error?: string;
  /** Esito dell'ultima operazione da mostrare nel popup (chiave i18n e argomento), es. dopo "Salva nella lista". */
  notice?: { key: string; arg?: string };
}
