import { createContext, useContext, useState, type DragEvent } from 'react';

/*
 * Drag and drop del pannello (nativo del browser), solo sui gruppi già aperti e sulle tab senza
 * gruppo. Le righe e le schede dicono dove andrebbe ciò che si trascina; lo spostamento vero lo fa
 * l'Organizzatore (`moveTab`, `moveGroup`). Da tastiera restano "Sposta in…" e i pulsanti A-Z.
 */

/** Cosa si sta trascinando. */
export type DragItem = { kind: 'tab'; tabId: number } | { kind: 'group'; groupId: number };

/** Dove va lasciandolo: una tab in un gruppo (o senza gruppo, `null`) prima di un'altra tab o in fondo; un gruppo prima di un altro o in fondo. */
export type DropTarget = { kind: 'tab'; groupId: number | null; beforeTabId: number | null } | { kind: 'group'; beforeGroupId: number | null };

/** Il segno mostrato durante il trascinamento: una linea prima o dopo, o l'evidenza di un gruppo o della sezione. */
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
  /** Fine del trascinamento, anche senza rilascio (Esc o fuori dal pannello). */
  end: () => void;
}

export const DragContext = createContext<DragState>({ enabled: false, item: null, indicator: null, start: () => {}, show: () => {}, drop: () => {}, end: () => {} });

/** Lo stato del trascinamento per `App`: `onDrop` riceve cosa e dove, a trascinamento finito. */
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

/** Classe del segno per l'elemento `key`, e `dragging` per quello trascinato. */
function classes(state: DragState, key: string, dragged: boolean): string {
  const edge = state.indicator?.key === key ? ` drop-${state.indicator.edge}` : '';
  return `${dragged ? ' dragging' : ''}${edge}`;
}

/** Metà superiore o inferiore dell'elemento sotto il puntatore. */
const edgeOf = (e: DragEvent<HTMLElement>): 'before' | 'after' => {
  const box = e.currentTarget.getBoundingClientRect();
  return e.clientY < box.top + box.height / 2 ? 'before' : 'after';
};

/** Uscendo davvero dall'elemento (non verso un suo figlio) il suo segno sparisce. */
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

/** Accetta il rilascio qui: senza `preventDefault` il browser non lo permette. */
function accept(e: DragEvent<HTMLElement>) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
}

/**
 * Una riga trascinabile: una tab di un gruppo aperto (`groupId`) o senza gruppo (`null`). Una tab
 * lasciata sopra la riga va prima o dopo di lei (`nextTabId` è la tab che la segue, `null` se è l'ultima).
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
 * La scheda di un gruppo aperto. Si trascina dall'intestazione (`header`); un altro gruppo lasciato
 * sopra la scheda va prima o dopo (`nextGroupId` è il gruppo che segue nella barra), una tab lasciata
 * fuori dalle righe va in fondo al gruppo.
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

/** L'elenco delle tab senza gruppo: una tab lasciata fuori dalle righe esce dal suo gruppo e va in fondo. */
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
