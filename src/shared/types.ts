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

/** Da dove viene un gruppo proposto. `manual`: creato dall'utente con "Nuovo gruppo". */
export type Provenance = 'list' | 'existing' | 'ai' | 'domain' | 'manual';

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
    | 'downloading'
    | 'not-supported';
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
   * Mette una tab (libera o già in un gruppo proposto) in un gruppo della proposta, in un gruppo
   * già aperto in Chrome che la proposta non tocca ancora oppure in un gruppo nuovo, tutto suo. Il
   * pannello manda i dati della tab perché una tab libera non è nella proposta; l'Organizzatore
   * controlla che sia davvero libera.
   */
  | { kind: 'add-tab'; tab: ProposedTab; to: { groupId: string } | { existingGroup: ExistingGroupRef } | { newGroup: true } };

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

/** "Metti sempre qui" proposto dopo uno spostamento: la tab, il sito che verrebbe salvato e la categoria. */
export interface RememberOffer {
  tabId: number;
  site: string;
  category: string;
}

/** Perché una tab non può entrare in un gruppo: l'estensione non la tocca mai. */
export type HeldReason = 'pinned' | 'internal' | 'excluded' | 'loading';

/** Un gruppo già aperto in Chrome, con le sue tab di adesso e quelle che la proposta gli aggiunge. */
export interface ExistingGroupView {
  group: ExistingGroupRef;
  current: ProposedTab[];
  added: ProposedTab[];
  /** Il gruppo della proposta che lo estende, se c'è. */
  proposedGroupId?: string;
  collapsed: boolean;
  /** Vero se il nome è quello di una categoria (senza distinguere maiuscole e minuscole). */
  isCategory: boolean;
}

/** Dettagli dal vivo di una tab che la proposta non porta. */
export interface LiveTab {
  active: boolean;
  audible: boolean;
  muted: boolean;
  /** Giorni senza essere guardata, solo per le tab che "Chiudi inattive" chiuderebbe. */
  idleDays?: number;
}

/** Tutta la finestra come la mostra il pannello: niente resta nascosto. */
export interface WindowView {
  existing: ExistingGroupView[];
  /** Gruppi nuovi della proposta (lista, nuovo AI, sito). */
  created: ProposedGroup[];
  /** Tab libere che la proposta lascia fuori: l'utente può metterle in un gruppo. */
  free: ProposedTab[];
  /** Tab che l'estensione non tocca mai, con il motivo. */
  held: { tab: ProposedTab; reason: HeldReason }[];
  /** Tab che "Chiudi duplicati" chiuderebbe, nell'ordine della barra. */
  duplicates: ProposedTab[];
  /** Tab che "Chiudi inattive" chiuderebbe, nell'ordine della barra. */
  inactive: ProposedTab[];
  /** Dopo quanti giorni una tab conta come inattiva. */
  inactiveDays: number;
  /** Dettagli dal vivo di ogni tab della finestra, per ID. */
  live: Record<number, LiveTab>;
}

/** Stato dell'Organizzatore, salvato in chrome.storage.session. */
export interface OrganizerState {
  phase: 'idle' | 'computing' | 'ready';
  windowId?: number;
  proposal?: Proposal;
  /** Vero se le tab, i gruppi aperti o le impostazioni sono cambiati dopo il calcolo della proposta. */
  stale?: boolean;
  /** Solo nello stato restituito da "Sposta in…" verso una categoria: l'offerta "Metti sempre qui". */
  offer?: RememberOffer;
  /**
   * Solo durante `computing` in modalità AI: la proposta per sito, pronta subito. Il pannello la mostra
   * in sola lettura mentre l'AI lavora; "Usa questa" ferma l'AI e la rende la proposta corrente.
   */
  preview?: Proposal;
  /** Presente finché "Annulla ultima organizzazione" è disponibile. */
  undo?: UndoSnapshot;
  /** Chiave i18n dell'ultimo errore, se il calcolo o l'applicazione sono falliti. */
  error?: string;
  /** Esito dell'ultima operazione da mostrare nel pannello (chiave i18n e argomento), es. un nome di categoria rifiutato. */
  notice?: {
    key: string;
    arg?: string | string[];
    /** Esito di "Aggiungi alle categorie": il pannello lo mostra solo nella snackbar, subito dopo il clic. */
    snackbar?: true;
  };
}
