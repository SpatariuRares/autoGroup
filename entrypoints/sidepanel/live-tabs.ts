import { createContext, useContext } from 'react';
import type { LiveTab } from '../../src/shared/types';

/**
 * Dettagli dal vivo delle tab della finestra (tab attiva, audio, giorni di inattività), per ID: la
 * proposta non li porta. Dato da `App` a tutte le righe, senza passarlo di mano in mano.
 */
export type LiveTabs = Record<number, LiveTab>;

export const LiveTabsContext = createContext<LiveTabs>({});

export const useLiveTabs = () => useContext(LiveTabsContext);
