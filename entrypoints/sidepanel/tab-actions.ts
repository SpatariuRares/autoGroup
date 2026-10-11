import { browser } from 'wxt/browser';

/*
 * Azioni dirette sulla barra delle tab che non toccano la proposta: niente passa dall'Organizzatore.
 * Se la tab o il gruppo non esistono più non succede nulla; il pannello si aggiorna da solo.
 */

/** Porta in primo piano una tab della finestra. */
export function openTab(tabId: number) {
  browser.tabs.update(tabId, { active: true }).catch(() => {});
}

/** Toglie o rimette l'audio di una tab. */
export function setMuted(tabId: number, muted: boolean) {
  browser.tabs.update(tabId, { muted }).catch(() => {});
}

/** Comprime o espande un gruppo nella barra di Chrome. */
export function setCollapsed(groupId: number, collapsed: boolean) {
  browser.tabGroups.update(groupId, { collapsed }).catch(() => {});
}
