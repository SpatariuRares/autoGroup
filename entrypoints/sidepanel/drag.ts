import { createContext, useContext, useState, type DragEvent } from 'react';

/*
 * Drag and drop of the panel (native to the browser), only on the groups already open and on the tabs without
 * a group. The rows and the cards show where what is dragged would go; the actual move is done by
 * the Organizer (`moveTab`, `moveGroup`, `newGroup`). From the keyboard "Move to…" and the A-Z buttons remain.
 */

/** What is being dragged. */
export type DragItem = { kind: 'tab'; tabId: number } | { kind: 'group'; groupId: number };

/**
 * Where it is dropped: a tab into a group (or ungrouped, `null`) before another tab or at the end,
 * or into a new group; a group before another or at the end.
 */
export type DropTarget =
  | { kind: 'tab'; groupId: number | null; beforeTabId: number | null }
  | { kind: 'new-group' }
  | { kind: 'group'; beforeGroupId: number | null };

/** The mark shown during dragging: a line before or after, or the highlight of a group or of the section. */
interface Indicator {
  key: string;
  edge: 'before' | 'after' | 'into';
}

interface DragState {
  enabled: boolean;
  item: DragItem | null;
  indicator: Indicator | null;
  start: (item: DragItem) => void;
  show: (indicator: Indicator | null) => void;
  drop: (target: DropTarget) => void;
  /** End of the dragging, even without a drop (Esc or outside the panel). */
  end: () => void;
}

export const DragContext = createContext<DragState>({ enabled: false, item: null, indicator: null, start: () => {}, show: () => {}, drop: () => {}, end: () => {} });

/** The dragging state for `App`: `onDrop` receives what and where, when the dragging ends. */
export function useDragState(enabled: boolean, onDrop: (item: DragItem, target: DropTarget) => void): DragState {
  const [item, setItem] = useState<DragItem | null>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const end = () => {
    setItem(null);
    setIndicator(null);
  };
  return {
    enabled,
    item,
    indicator,
    start: (next) => {
      setItem(next);
      setIndicator(null);
    },
    show: setIndicator,
    drop: (target) => {
      if (item) onDrop(item, target);
      end();
    },
    end,
  };
}

/** Mark class for the element `key`, and `dragging` for the one being dragged. */
function classes(state: DragState, key: string, dragged: boolean): string {
  const edge = state.indicator?.key === key ? ` drop-${state.indicator.edge}` : '';
  return `${dragged ? ' dragging' : ''}${edge}`;
}

/** Upper or lower half of the element under the pointer. */
const edgeOf = (e: DragEvent<HTMLElement>): 'before' | 'after' => {
  const box = e.currentTarget.getBoundingClientRect();
  return e.clientY < box.top + box.height / 2 ? 'before' : 'after';
};

/** Really leaving the element (not toward one of its children) makes its mark disappear. */
function leave(state: DragState, key: string) {
  return (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null) && state.indicator?.key === key) state.show(null);
  };
}

function startDrag(state: DragState, item: DragItem) {
  return (e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    state.start(item);
  };
}

/** Accepts the drop here: without `preventDefault` the browser does not allow it. */
function accept(e: DragEvent<HTMLElement>) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
}

/**
 * A draggable row: a tab of an open group (`groupId`) or ungrouped (`null`). A tab
 * dropped over the row goes before or after it (`nextTabId` is the tab that follows it, `null` if it is the last one).
 */
export function useTabDrag(tabId: number, place?: { groupId: number | null; nextTabId: number | null }) {
  const state = useContext(DragContext);
  if (!state.enabled || !place) return { className: '' };
  const key = `tab:${tabId}`;
  const takes = state.item?.kind === 'tab' && state.item.tabId !== tabId;
  return {
    className: classes(state, key, state.item?.kind === 'tab' && state.item.tabId === tabId),
    draggable: true,
    onDragStart: startDrag(state, { kind: 'tab', tabId }),
    onDragEnd: () => state.end(),
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!takes) return;
      accept(e);
      state.show({ key, edge: edgeOf(e) });
    },
    onDragLeave: leave(state, key),
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!takes) return;
      e.preventDefault();
      e.stopPropagation();
      state.drop({ kind: 'tab', groupId: place.groupId, beforeTabId: edgeOf(e) === 'before' ? tabId : place.nextTabId });
    },
  };
}

/**
 * The card of an open group. It is dragged from the header (`header`); another group dropped
 * over the card goes before or after (`nextGroupId` is the group that follows it in the tab strip), a tab dropped
 * outside the rows goes to the end of the group.
 */
export function useGroupDrag(groupId: number, nextGroupId: number | null) {
  const state = useContext(DragContext);
  if (!state.enabled) return { card: { className: '' }, header: {} };
  const key = `group:${groupId}`;
  const item = state.item;
  const takes = item !== null && (item.kind === 'tab' || item.groupId !== groupId);
  const target = (e: DragEvent<HTMLElement>): DropTarget =>
    item?.kind === 'group'
      ? { kind: 'group', beforeGroupId: edgeOf(e) === 'before' ? groupId : nextGroupId }
      : { kind: 'tab', groupId, beforeTabId: null };
  return {
    header: { draggable: true, onDragStart: startDrag(state, { kind: 'group', groupId }), onDragEnd: () => state.end() },
    card: {
      className: classes(state, key, item?.kind === 'group' && item.groupId === groupId),
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!takes) return;
        accept(e);
        state.show({ key, edge: item?.kind === 'group' ? edgeOf(e) : 'into' });
      },
      onDragLeave: leave(state, key),
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!takes) return;
        e.preventDefault();
        state.drop(target(e));
      },
    },
  };
}

/** The list of ungrouped tabs: a tab dropped outside the rows leaves its group and goes to the end. */
export function useFreeDrop() {
  const state = useContext(DragContext);
  if (!state.enabled) return { className: '' };
  const key = 'free';
  const takes = state.item?.kind === 'tab';
  return {
    className: classes(state, key, false),
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!takes) return;
      accept(e);
      state.show({ key, edge: 'into' });
    },
    onDragLeave: leave(state, key),
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!takes) return;
      e.preventDefault();
      state.drop({ kind: 'tab', groupId: null, beforeTabId: null });
    },
  };
}

/** The "New group" zone, which appears when dragging a tab: dropped here, the tab goes into a group of its own. */
export function useNewGroupDrop() {
  const state = useContext(DragContext);
  if (!state.enabled) return { className: '' };
  const key = 'new-group';
  const takes = state.item?.kind === 'tab';
  return {
    className: classes(state, key, false),
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!takes) return;
      accept(e);
      state.show({ key, edge: 'into' });
    },
    onDragLeave: leave(state, key),
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!takes) return;
      e.preventDefault();
      state.drop({ kind: 'new-group' });
    },
  };
}
