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
  /** Il sito della regola che ha messo la tab nel suo gruppo; sparisce se l'utente la sposta. */
  rule?: string;
}

export interface ProposedGroup {
  /** ID stabile dentro la proposta, usato dal pannello per le modifiche. */
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

/** Fasi misurate di un calcolo della proposta. */
export type Phase = 'inputs' | 'preview' | 'descriptions' | 'classifier' | 'generator' | 'domain';

/** Durata in ms di ogni fase eseguita e del calcolo intero (`total`). Solo diagnostica. */
export type Timings = Partial<Record<Phase | 'total', number>>;

export interface Proposal {
  windowId: number;
  createdAt: number;
  /** Impronta delle tab libere e delle impostazioni usate: serve a capire se la proposta è ancora attuale. */
  signature: string;
  groups: ProposedGroup[];
  warnings: ProposalWarning[];
  /** Dove è andato il tempo del calcolo; assente nell'anteprima per sito. */
  timings?: Timings;
}

/** Una modifica fatta dall'utente nell'anteprima. */
export type ProposalEdit =
  | { kind: 'rename'; groupId: string; name: string }
  | { kind: 'recolor'; groupId: string; color: GroupColor }
  | { kind: 'discard-group'; groupId: string }
  | { kind: 'remove-tab'; tabId: number }
  | { kind: 'move-tab'; tabId: number; toGroupId: string }
  /**
   * Mette una tab (libera o già in un gruppo proposto) in un gruppo della proposta oppure in un gruppo
   * già aperto in Chrome che la proposta non tocca ancora. Il pannello manda i dati della tab perché
   * una tab libera non è nella proposta; l'Organizzatore controlla che sia davvero libera.
   */
  | { kind: 'add-tab'; tab: ProposedTab; to: { groupId: string } | { existingGroup: ExistingGroupRef } };

/** Un gruppo già aperto in Chrome, come lo vede il pannello. */
export interface ExistingGroupRef {
  id: number;
  name: string;
  color: GroupColor;
}

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
  /**
   * Solo durante `computing` in modalità AI: la proposta per sito, pronta subito. Il pannello la mostra
   * in sola lettura mentre l'AI lavora; "Usa questa" ferma l'AI e la rende la proposta corrente.
   */
  preview?: Proposal;
  /** Presente finché "Annulla ultima organizzazione" è disponibile. */
  undo?: UndoSnapshot;
  /** Chiave i18n dell'ultimo errore, se il calcolo o l'applicazione sono falliti. */
  error?: string;
  /** Esito dell'ultima operazione da mostrare nel pannello (chiave i18n e argomento), es. dopo "Salva nella lista". */
  notice?: { key: string; arg?: string };
}
