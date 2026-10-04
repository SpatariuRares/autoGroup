import { browser } from 'wxt/browser';
import { loadSettings } from '../settings';
import type { OrganizerState, Proposal, ProposalEdit } from '../shared/types';
import { applyProposal } from './applier';
import { buildProposal, collectInputs, signatureOf } from './proposal-builder';
import { TAB_GROUP_ID_NONE } from './tab-selection';
import { editProposal } from './proposal-edits';
import { saveGroupToList } from './save-to-list';
import { loadState, saveState } from './session-state';
import { selectCandidateTabs } from './tab-selection';
import { restoreSnapshot } from './undo';

/**
 * "add-tab" arriva dal pannello con i dati della tab: si accetta solo una tab già nella proposta o
 * ancora libera nella finestra (stesse regole della selezione), e solo verso un gruppo di quella finestra.
 * I dati della tab vengono riletti dal browser, non presi dal messaggio.
 */
async function checkAddTab(proposal: Proposal, edit: Extract<ProposalEdit, { kind: 'add-tab' }>): Promise<ProposalEdit | null> {
  const inProposal = proposal.groups.flatMap((g) => g.tabs).find((t) => t.tabId === edit.tab.tabId);
  let tab = inProposal;
  if (!tab) {
    const { excludedDomains } = await loadSettings();
    const tabs = await browser.tabs.query({ windowId: proposal.windowId });
    const candidate = selectCandidateTabs(tabs, excludedDomains).find((t) => t.tabId === edit.tab.tabId);
    if (!candidate) return null;
    tab = { tabId: candidate.tabId, title: candidate.title, url: candidate.url, favIconUrl: candidate.favIconUrl };
  }
  if ('existingGroup' in edit.to) {
    const group = await browser.tabGroups.get(edit.to.existingGroup.id).catch(() => null);
    if (!group || group.windowId !== proposal.windowId) return null;
  }
  return { ...edit, tab };
}

export interface OrganizerOptions {
  /** Chiamato a ogni cambio di stato, per avvisare il pannello se è aperto. */
  onStateChange?: (state: OrganizerState) => void;
}

export interface Organizer {
  /**
   * Calcola una proposta per la finestra e la salva nello stato.
   * Riusa la proposta salvata (con le modifiche dell'utente) se è per la stessa finestra e le tab libere
   * e le impostazioni non sono cambiate, salvo `force`. Un calcolo già in corso per la stessa finestra
   * viene condiviso; per un'altra finestra, o con `force`, ne parte uno nuovo dopo.
   */
  propose(windowId: number, options?: { force?: boolean }): Promise<OrganizerState>;
  /** Modifica la proposta corrente (rinomina, colore, togli o sposta tab, scarta gruppo). */
  edit(edit: ProposalEdit): Promise<OrganizerState>;
  /** "Salva nella lista": aggiunge un gruppo inventato dall'AI alla lista delle categorie. */
  saveToList(groupId: string): Promise<OrganizerState>;
  /** Crea in Chrome i gruppi della proposta corrente, dopo aver salvato la foto per "Annulla". */
  apply(): Promise<OrganizerState>;
  /** Annulla l'ultima organizzazione applicata. */
  undo(): Promise<OrganizerState>;
  /**
   * Chiude una tab dal pannello e la toglie dalla proposta. Se la proposta era ancora attuale resta
   * attuale (nuova impronta), così chiudere una tab non costa un nuovo calcolo.
   */
  closeTab(tabId: number): Promise<OrganizerState>;
  /** "Interrompi": annulla le richieste in corso e i calcoli in coda; nessuno produce una proposta. */
  abort(): Promise<OrganizerState>;
  /** Stato corrente: fase, proposta, annulla disponibile. */
  state(): Promise<OrganizerState>;
}

export function createOrganizer(options: OrganizerOptions = {}): Organizer {
  /** L'ultimo calcolo chiesto, condiviso con le richieste successive per la stessa finestra. */
  let computing: { windowId: number; result: Promise<OrganizerState> } | null = null;
  /** Un controller per ogni calcolo in corso o in coda, usati da "Interrompi". */
  const controllers = new Set<AbortController>();
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

  async function propose(windowId: number, force: boolean, signal: AbortSignal): Promise<OrganizerState> {
    const current = await loadState();
    // La foto per "Annulla" resta valida fino alla prossima organizzazione applicata.
    const { undo } = current;
    try {
      // "Interrompi" premuto mentre il calcolo era ancora in coda.
      signal.throwIfAborted();
      const inputs = await collectInputs(windowId);
      const reusable =
        !force &&
        current.phase === 'ready' &&
        current.windowId === windowId &&
        current.proposal?.signature === signatureOf(inputs);
      if (reusable) return current;

      await setState({ phase: 'computing', windowId, undo });
      const proposal = await buildProposal(inputs, signal);
      signal.throwIfAborted();
      return await setState({ phase: 'ready', windowId, proposal, undo });
    } catch (err) {
      if (signal.aborted) return await setState({ phase: 'idle', windowId, undo, notice: { key: 'popupAborted' } });
      console.error('autoGroup: calcolo della proposta fallito', err);
      return await setState({ phase: 'idle', windowId, error: 'errorPropose', undo });
    }
  }

  return {
    propose(windowId, { force = false } = {}) {
      // Due richieste ravvicinate per la stessa finestra (es. il pannello aperto due volte) condividono il calcolo.
      if (computing && computing.windowId === windowId && !force) return computing.result;
      const controller = new AbortController();
      controllers.add(controller);
      const result = exclusive(() => propose(windowId, force, controller.signal)).finally(() => {
        controllers.delete(controller);
        if (computing?.result === result) computing = null;
      });
      computing = { windowId, result };
      return result;
    },

    edit(edit) {
      return exclusive(async () => {
        const current = await loadState();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const checked = edit.kind === 'add-tab' ? await checkAddTab(current.proposal, edit) : edit;
        if (!checked) return current;
        const { notice: _done, ...rest } = current;
        return setState({ ...rest, proposal: editProposal(current.proposal, checked) });
      });
    },

    saveToList(groupId) {
      return exclusive(async () => {
        const current = await loadState();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const result = await saveGroupToList(current.proposal, groupId);
        if (!result) return current;
        return setState({ ...current, proposal: result.proposal, notice: result.notice });
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

    closeTab(tabId) {
      return exclusive(async () => {
        const current = await loadState();
        const tab = await browser.tabs.get(tabId).catch(() => null);
        if (!tab) return current;
        const proposal = current.phase === 'ready' && current.proposal?.windowId === tab.windowId ? current.proposal : undefined;
        // Solo una tab senza gruppo cambia l'impronta (tab candidate). Se era in un gruppo aperto e ne era
        // l'ultima, il gruppo sparisce: la proposta resta scaduta e il pannello propone di ricalcolare.
        const refresh =
          proposal !== undefined &&
          (tab.groupId ?? TAB_GROUP_ID_NONE) === TAB_GROUP_ID_NONE &&
          proposal.signature === signatureOf(await collectInputs(proposal.windowId));
        await browser.tabs.remove(tabId);
        if (!proposal) return current;
        let next = editProposal(proposal, { kind: 'remove-tab', tabId });
        if (refresh) next = { ...next, signature: signatureOf(await collectInputs(proposal.windowId)) };
        return setState({ ...current, proposal: next });
      });
    },

    async abort() {
      // Non passa dalla coda: deve agire proprio mentre il calcolo la occupa.
      for (const controller of controllers) controller.abort();
      return computing?.result ?? loadState();
    },

    state: loadState,
  };
}
