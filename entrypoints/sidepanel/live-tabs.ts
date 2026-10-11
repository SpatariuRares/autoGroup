import { createContext, useContext } from 'react';
import type { Browser } from 'wxt/browser';

/**
 * Tab e gruppi della finestra letti dal vivo, per i dettagli che la proposta non porta: tab attiva,
 * audio, ultimo accesso, gruppi compressi. Dato da `App` a tutte le righe, senza passarlo di mano in mano.
 */
export interface LiveTabs {
  tabs: Map<number, Browser.tabs.Tab>;
  groups: Map<number, Browser.tabGroups.TabGroup>;
  /** Tab che "Chiudi inattive" chiuderebbe. */
  inactive: Set<number>;
  /** Il momento di riferimento per contare i giorni di inattività. */
  now: number;
}

export const LiveTabsContext = createContext<LiveTabs>({ tabs: new Map(), groups: new Map(), inactive: new Set(), now: 0 });

export const useLiveTabs = () => useContext(LiveTabsContext);
