import type { OrganizerState, ProposalEdit } from '../shared/types';
import { applyProposal } from './applier';
import { buildProposal, collectInputs, signatureOf } from './proposal-builder';
import { editProposal } from './proposal-edits';
import { loadState, saveState } from './session-state';
import { restoreSnapshot } from './undo';

export interface OrganizerOptions {
  /** Chiamato a ogni cambio di stato, per avvisare il popup se è aperto. */
  onStateChange?: (state: OrganizerState) => void;
}

export interface Organizer {
  /**
   * Calcola una proposta per la finestra e la salva nello stato.
   * Riusa la proposta salvata (con le modifiche dell'utente) se è per la stessa finestra e le tab libere
   * e le impostazioni non sono cambiate, salvo `force`. Un calcolo già in corso viene condiviso.
   */
  propose(windowId: number, options?: { force?: boolean }): Promise<OrganizerState>;
  /** Modifica la proposta corrente (rinomina, colore, togli o sposta tab, scarta gruppo). */
  edit(edit: ProposalEdit): Promise<OrganizerState>;
  /** Crea in Chrome i gruppi della proposta corrente, dopo aver salvato la foto per "Annulla". */
  apply(): Promise<OrganizerState>;
  /** Annulla l'ultima organizzazione applicata. */
  undo(): Promise<OrganizerState>;
  /** Stato corrente: fase, proposta, annulla disponibile. */
  state(): Promise<OrganizerState>;
}

export function createOrganizer(options: OrganizerOptions = {}): Organizer {
  let computing: Promise<OrganizerState> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  /**
   * Esegue le operazioni una alla volta, nell'ordine di arrivo. Ognuna legge lo stato, tocca le tab
   * e riscrive lo stato: due operazioni intrecciate potrebbero cancellarsi a vicenda (es. una proposta
   * calcolata durante "Applica" che riscrive la vecchia foto per "Annulla").
   */
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  }

  async function setState(state: OrganizerState): Promise<OrganizerState> {
    await saveState(state);
    options.onStateChange?.(state);
    return state;
  }

  async function propose(windowId: number, force: boolean): Promise<OrganizerState> {
    const current = await loadState();
    // La foto per "Annulla" resta valida fino alla prossima organizzazione applicata.
    const { undo } = current;
    try {
      const inputs = await collectInputs(windowId);
      const reusable =
        !force &&
        current.phase === 'ready' &&
        current.windowId === windowId &&
        current.proposal?.signature === signatureOf(inputs);
      if (reusable) return current;

      await setState({ phase: 'computing', windowId, undo });
      return await setState({ phase: 'ready', windowId, proposal: await buildProposal(inputs), undo });
    } catch (err) {
      console.error('autoGroup: calcolo della proposta fallito', err);
      return await setState({ phase: 'idle', windowId, error: 'errorPropose', undo });
    }
  }

  return {
    propose(windowId, { force = false } = {}) {
      // Due richieste ravvicinate (es. il popup aperto due volte) condividono lo stesso calcolo.
      if (computing) return computing;
      computing = exclusive(() => propose(windowId, force)).finally(() => {
        computing = null;
      });
      return computing;
    },

    edit(edit) {
      return exclusive(async () => {
        const current = await loadState();
        if (current.phase !== 'ready' || !current.proposal) return current;
        return setState({ ...current, proposal: editProposal(current.proposal, edit) });
      });
    },

    apply() {
      return exclusive(async () => {
        const current = await loadState();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const windowId = current.proposal.windowId;
        try {
          const undo = await applyProposal(current.proposal, (snapshot) => saveState({ ...current, undo: snapshot }));
          return await setState({ phase: 'idle', windowId, undo });
        } catch (err) {
          console.error('autoGroup: applicazione fallita', err);
          return await setState({ ...(await loadState()), error: 'errorApply' });
        }
      });
    },

    undo() {
      return exclusive(async () => {
        const current = await loadState();
        if (!current.undo) return current;
        try {
          await restoreSnapshot(current.undo);
          // Una proposta calcolata dopo l'organizzazione non vale più: le tab sono di nuovo libere.
          return await setState({ phase: 'idle', windowId: current.undo.windowId });
        } catch (err) {
          console.error('autoGroup: annullamento fallito', err);
          return await setState({ ...current, error: 'errorUndo' });
        }
      });
    },

    state: loadState,
  };
}
