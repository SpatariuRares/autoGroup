import { browser } from 'wxt/browser';
import { loadSettings } from '../settings';
import type { OrganizerState, Proposal, ProposalEdit, WindowView } from '../shared/types';
import { applyProposal } from './applier';
import { autoGroupTab } from './auto-group';
import { findDuplicates } from './duplicates';
import { findInactive } from './inactive';
import { willAskAi } from './pipeline';
import { buildPreview, buildProposal, collectInputs, keepCurrent, signatureOf } from './proposal-builder';
import { editProposal } from './proposal-edits';
import { rememberOffer, rememberTabSite } from './remember-site';
import { moveGroup, moveTab } from './moves';
import { saveGroupToList } from './save-to-list';
import { sortGroups, sortTabs } from './sort';
import { createStopwatch } from './stopwatch';
import { selectCandidateTabs } from './tab-selection';
import { restoreSnapshot } from './undo';
import { buildWindowView } from './window-view';

const STATE_KEY = 'organizer';

/** Stato dell'Organizzatore in chrome.storage.session: sopravvive al pannello, non alla chiusura di Chrome. */
async function loadState(): Promise<OrganizerState> {
  const stored = await browser.storage.session.get(STATE_KEY);
  return (stored[STATE_KEY] as OrganizerState | undefined) ?? { phase: 'idle' };
}

async function saveState(state: OrganizerState): Promise<void> {
  await browser.storage.session.set({ [STATE_KEY]: state });
}

/** Motivo dell'interruzione chiesta da "Usa questa": il calcolo finisce con l'anteprima per sito. */
const ACCEPT_PREVIEW = 'accept-preview';

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
  /**
   * Modifica la proposta corrente (rinomina, colore, togli o sposta tab, scarta gruppo). Dopo "add-tab"
   * verso una categoria lo stato restituito porta l'offerta "Metti sempre qui" (vedi `rememberOffer`),
   * che sparisce alla prossima operazione.
   */
  edit(edit: ProposalEdit): Promise<OrganizerState>;
  /** "Salva nella lista": aggiunge un gruppo inventato dall'AI alla lista delle categorie. */
  saveToList(groupId: string): Promise<OrganizerState>;
  /**
   * "Metti sempre qui": la tab andrà sempre nella categoria del suo gruppo nella proposta (vedi
   * `rememberTabSite`). Non fa nulla per i gruppi che non sono una categoria.
   */
  rememberSite(tabId: number): Promise<OrganizerState>;
  /** Crea in Chrome i gruppi della proposta corrente, dopo aver salvato la foto per "Annulla". */
  apply(): Promise<OrganizerState>;
  /** Annulla l'ultima organizzazione applicata. */
  undo(): Promise<OrganizerState>;
  /**
   * Chiude una tab dal pannello e la toglie dalla proposta. Se la proposta era ancora attuale resta
   * attuale (nuova impronta), così chiudere una tab non costa un nuovo calcolo. Se era l'ultima di un
   * gruppo aperto, il gruppo sparisce e le tab che la proposta gli aggiungeva tornano libere.
   */
  closeTab(tabId: number): Promise<OrganizerState>;
  /**
   * "Chiudi doppioni": chiude le tab scelte nell'anteprima del pannello, ma solo quelle che sono ancora
   * doppioni (vedi `findDuplicates`, ricalcolato qui): una tab che non lo è più resta aperta. Come
   * `closeTab`, una proposta ancora attuale resta attuale, senza le tab chiuse.
   */
  closeDuplicates(windowId: number, tabIds: number[]): Promise<OrganizerState>;
  /**
   * "Chiudi inattive": chiude le tab scelte nell'anteprima del pannello, ma solo quelle ancora inattive
   * (vedi `findInactive`, ricalcolato qui). Come `closeDuplicates`, la proposta resta attuale.
   */
  closeInactive(windowId: number, tabIds: number[]): Promise<OrganizerState>;
  /**
   * Chiude tutte le tab di un gruppo aperto in Chrome. Le tab che la proposta gli aggiungeva tornano
   * libere; la proposta resta attuale.
   */
  closeGroup(groupId: number): Promise<OrganizerState>;
  /**
   * "Sposta in…" senza proposta: mette subito una tab libera in un gruppo aperto della sua finestra.
   * Si accetta solo una tab che la selezione prenderebbe (non fissata, non interna, non esclusa).
   */
  groupTab(tabId: number, groupId: number): Promise<OrganizerState>;
  /**
   * "Gruppi A-Z": mette in ordine alfabetico i gruppi della finestra nella barra (vedi `sortGroups`).
   * Non tocca la proposta: l'ordine delle tab non fa parte della sua impronta.
   */
  sortGroups(windowId: number): Promise<OrganizerState>;
  /** "Tab A-Z": ordina per titolo le tab di ogni gruppo e quelle libere (vedi `sortTabs`). Come `sortGroups`. */
  sortTabs(windowId: number): Promise<OrganizerState>;
  /**
   * Drag and drop di una tab: la sposta in un gruppo aperto della sua finestra (o fuori da ogni gruppo
   * con `groupId` null), prima di `beforeTabId` o in fondo (vedi `moveTab`). Le tab fissate non si
   * spostano. Come per "Sposta in…" senza proposta, una proposta che ne dipende diventa superata.
   */
  moveTab(tabId: number, groupId: number | null, beforeTabId: number | null): Promise<OrganizerState>;
  /** Drag and drop di un gruppo aperto, intero: prima di `beforeGroupId` o dopo l'ultimo gruppo (vedi `moveGroup`). */
  moveGroup(groupId: number, beforeGroupId: number | null): Promise<OrganizerState>;
  /**
   * Raggruppamento automatico di una tab che ha appena cambiato URL, con le sole regole sui siti
   * (vedi `autoGroupTab`). Non cambia lo stato: una proposta che conteneva la tab diventa superata.
   */
  autoGroupTab(tabId: number): Promise<void>;
  /** "Interrompi": annulla le richieste in corso e i calcoli in coda; nessuno produce una proposta. */
  abort(): Promise<OrganizerState>;
  /**
   * "Usa questa": come "Interrompi", ma il calcolo che sta mostrando l'anteprima per sito finisce con
   * quella come proposta corrente, modificabile e applicabile. Senza anteprima equivale a "Interrompi".
   */
  acceptPreview(): Promise<OrganizerState>;
  /**
   * Ricontrolla se la proposta corrente è ancora attuale (tab candidate, gruppi aperti, impostazioni,
   * provider) e lo scrive in `stale`. Il service worker lo chiama quando cambiano tab, gruppi,
   * impostazioni o permessi; le operazioni dell'Organizzatore che tengono attuale la proposta non la
   * fanno risultare scaduta, perché passano dalla stessa coda.
   */
  checkStale(): Promise<OrganizerState>;
  /**
   * Tutta la finestra come la mostra il pannello: gruppi aperti, gruppi nuovi della proposta (o
   * dell'anteprima per sito durante il calcolo), tab libere, tab mai toccate, doppioni, inattive e i
   * dettagli dal vivo. Non aspetta la coda: si può chiedere mentre l'AI calcola.
   */
  view(windowId: number): Promise<WindowView>;
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

  /** Lo stato salvato, senza l'offerta "Metti sempre qui": vale solo per la risposta a `edit`. */
  async function load(): Promise<OrganizerState> {
    const { offer: _, ...state } = await loadState();
    return state;
  }

  async function setState(state: OrganizerState): Promise<OrganizerState> {
    await saveState(state);
    options.onStateChange?.(state);
    return state;
  }

  /**
   * Chiude più tab di una finestra e le toglie dalla proposta. Un gruppo aperto rimasto vuoto sparisce
   * da Chrome: il gruppo della proposta che lo estendeva viene scartato e le sue tab tornano libere.
   * Così una proposta attuale resta attuale (nuova impronta), senza un nuovo calcolo.
   */
  async function closeTabs(windowId: number, tabIds: number[]): Promise<OrganizerState> {
    const current = await load();
    if (tabIds.length === 0) return current;
    const proposal = current.phase === 'ready' && current.proposal?.windowId === windowId ? current.proposal : undefined;
    if (!proposal) {
      await browser.tabs.remove(tabIds);
      return current;
    }
    const next = await keepCurrent(proposal, async () => {
      await browser.tabs.remove(tabIds);
      let edited = tabIds.reduce((p, tabId) => editProposal(p, { kind: 'remove-tab', tabId }), proposal);
      for (const group of edited.groups) {
        if (group.existingGroupId === undefined) continue;
        if (!(await browser.tabGroups.get(group.existingGroupId).catch(() => null))) {
          edited = editProposal(edited, { kind: 'discard-group', groupId: group.id });
        }
      }
      return edited;
    });
    return setState({ ...current, proposal: next });
  }

  async function propose(windowId: number, force: boolean, signal: AbortSignal): Promise<OrganizerState> {
    const current = await load();
    // La foto per "Annulla" resta valida fino alla prossima organizzazione applicata.
    const { undo } = current;
    let preview: Proposal | undefined;
    try {
      // "Interrompi" premuto mentre il calcolo era ancora in coda.
      signal.throwIfAborted();
      const clock = createStopwatch();
      const inputs = await collectInputs(windowId);
      clock.lap('inputs');
      const reusable =
        !force &&
        current.phase === 'ready' &&
        current.windowId === windowId &&
        current.proposal?.signature === signatureOf(inputs);
      if (reusable) {
        const { stale: _, ...fresh } = current;
        return current.stale ? await setState(fresh) : current;
      }

      // Mentre l'AI lavora il pannello mostra subito la proposta per sito, che costa pochi millisecondi.
      preview = willAskAi(inputs) ? buildPreview(inputs) : undefined;
      await setState({ phase: 'computing', windowId, undo, ...(preview ? { preview } : {}) });
      clock.lap('preview');
      const proposal = await buildProposal(inputs, signal, clock);
      signal.throwIfAborted();
      console.info('autoGroup: tempi del calcolo (ms)', proposal.timings);
      return await setState({ phase: 'ready', windowId, proposal, undo });
    } catch (err) {
      if (signal.aborted && signal.reason === ACCEPT_PREVIEW && preview) {
        return await setState({ phase: 'ready', windowId, proposal: preview, undo });
      }
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
        const current = await load();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const checked = edit.kind === 'add-tab' ? await checkAddTab(current.proposal, edit) : edit;
        if (!checked) return current;
        const { notice: _done, ...rest } = current;
        const proposal = editProposal(current.proposal, checked);
        const offer = checked.kind === 'add-tab' ? rememberOffer(proposal, checked.tab.tabId, await loadSettings()) : null;
        return setState({ ...rest, proposal, ...(offer ? { offer } : {}) });
      });
    },

    saveToList(groupId) {
      return exclusive(async () => {
        const current = await load();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const result = await saveGroupToList(current.proposal, groupId);
        if (!result) return current;
        return setState({ ...current, proposal: result.proposal, notice: result.notice });
      });
    },

    rememberSite(tabId) {
      return exclusive(async () => {
        const current = await load();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const result = await rememberTabSite(current.proposal, tabId);
        if (!result) return current;
        return setState({ ...current, proposal: result.proposal, notice: result.notice });
      });
    },

    apply() {
      return exclusive(async () => {
        const current = await load();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const windowId = current.proposal.windowId;
        try {
          const undo = await applyProposal(current.proposal, (snapshot) => saveState({ ...current, undo: snapshot }));
          return await setState({ phase: 'idle', windowId, undo });
        } catch (err) {
          console.error('autoGroup: applicazione fallita', err);
          return await setState({ ...(await load()), error: 'errorApply' });
        }
      });
    },

    undo() {
      return exclusive(async () => {
        const current = await load();
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
        const tab = await browser.tabs.get(tabId).catch(() => null);
        if (!tab) return load();
        return closeTabs(tab.windowId, [tabId]);
      });
    },

    closeDuplicates(windowId, chosen) {
      return exclusive(async () => {
        const { excludedDomains } = await loadSettings();
        const tabIds = findDuplicates(await browser.tabs.query({ windowId }), excludedDomains).filter((id) => chosen.includes(id));
        return closeTabs(windowId, tabIds);
      });
    },

    closeInactive(windowId, chosen) {
      return exclusive(async () => {
        const { excludedDomains } = await loadSettings();
        const tabIds = findInactive(await browser.tabs.query({ windowId }), excludedDomains, Date.now()).filter((id) => chosen.includes(id));
        return closeTabs(windowId, tabIds);
      });
    },

    closeGroup(groupId) {
      return exclusive(async () => {
        const group = await browser.tabGroups.get(groupId).catch(() => null);
        if (!group) return load();
        const tabIds = (await browser.tabs.query({ windowId: group.windowId, groupId })).map((tab) => tab.id!);
        return closeTabs(group.windowId, tabIds);
      });
    },

    groupTab(tabId, groupId) {
      return exclusive(async () => {
        const current = await load();
        const [tab, group] = await Promise.all([browser.tabs.get(tabId).catch(() => null), browser.tabGroups.get(groupId).catch(() => null)]);
        if (!tab || !group || group.windowId !== tab.windowId) return current;
        const { excludedDomains } = await loadSettings();
        const tabs = await browser.tabs.query({ windowId: tab.windowId });
        if (!selectCandidateTabs(tabs, excludedDomains).some((t) => t.tabId === tabId)) return current;
        await browser.tabs.group({ tabIds: [tabId], groupId });
        return current;
      });
    },

    sortGroups(windowId) {
      return exclusive(async () => {
        await sortGroups(windowId);
        return load();
      });
    },

    sortTabs(windowId) {
      return exclusive(async () => {
        await sortTabs(windowId);
        return load();
      });
    },

    moveTab(tabId, groupId, beforeTabId) {
      return exclusive(async () => {
        await moveTab(tabId, groupId, beforeTabId);
        return load();
      });
    },

    moveGroup(groupId, beforeGroupId) {
      return exclusive(async () => {
        await moveGroup(groupId, beforeGroupId);
        return load();
      });
    },

    autoGroupTab(tabId) {
      return exclusive(async () => {
        try {
          await autoGroupTab(tabId);
        } catch (err) {
          // Es. una finestra che non accetta gruppi, o una tab chiusa a metà: la tab resta dov'è.
          console.error('autoGroup: raggruppamento automatico fallito', err);
        }
      });
    },

    checkStale() {
      return exclusive(async () => {
        const current = await load();
        if (current.phase !== 'ready' || !current.proposal) return current;
        const stale = current.proposal.signature !== signatureOf(await collectInputs(current.proposal.windowId));
        if (stale === (current.stale ?? false)) return current;
        const { stale: _, ...rest } = current;
        return setState(stale ? { ...rest, stale } : rest);
      });
    },

    async view(windowId) {
      const [current, tabs, groups, { excludedDomains }] = await Promise.all([
        load(),
        browser.tabs.query({ windowId }),
        browser.tabGroups.query({ windowId }),
        loadSettings(),
      ]);
      const mine = current.windowId === windowId;
      const proposal = mine && current.phase === 'ready' ? current.proposal : mine && current.phase === 'computing' ? current.preview : undefined;
      return buildWindowView(tabs, groups, proposal, excludedDomains, Date.now());
    },

    async abort() {
      // Non passa dalla coda: deve agire proprio mentre il calcolo la occupa.
      for (const controller of controllers) controller.abort();
      return computing?.result ?? load();
    },

    async acceptPreview() {
      for (const controller of controllers) controller.abort(ACCEPT_PREVIEW);
      return computing?.result ?? load();
    },

    state: load,
  };
}
