import { createContext, useContext } from 'react';
import type { LiveTab } from '../../src/shared/types';

/**
 * Live details of the window's tabs (active tab, audio, days of inactivity), by ID: the
 * proposal does not carry them. Given by `App` to all the rows, without passing it from hand to hand.
 */
export type LiveTabs = Record<number, LiveTab>;

export const LiveTabsContext = createContext<LiveTabs>({});

export const useLiveTabs = () => useContext(LiveTabsContext);
