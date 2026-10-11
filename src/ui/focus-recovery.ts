import { useLayoutEffect, useRef } from 'react';

/** Dopo quanto un ricordo non serve più: l'azione non ha tolto l'elemento, o l'ha tolto molto più tardi. */
const EXPIRY_MS = 10_000;

const FOCUSABLE = 'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], summary';

/** I controlli visibili dentro un elemento, nell'ordine in cui li raggiunge Tab. */
const controls = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((c) => c.checkVisibility());

interface Pending {
  from: HTMLElement;
  /** Le voci accanto a quella di partenza: prima le successive, poi le precedenti dalla più vicina. */
  neighbours: HTMLElement[];
  /** Posizione del controllo di partenza nella sua voce, per arrivare sullo stesso (es. da ✕ a ✕). */
  position: number;
  /** I contenitori della voce, dal più vicino: l'ultima risorsa se non resta nessuna voce. */
  ancestors: HTMLElement[];
  at: number;
}

/**
 * Se un clic o una scelta tolgono dalla pagina il controllo che ha il focus (chiudi una tab, togli un sito,
 * elimina una categoria…), il focus andrebbe al body e chi usa tastiera o screen reader ripartirebbe da capo.
 * Questo hook lo porta sullo stesso controllo della voce accanto (`items` è il selettore delle voci), o sul
 * primo controllo del contenitore più vicino rimasto. Restituisce il gestore da mettere su onClickCapture e
 * onChangeCapture della radice; il ripristino avviene dopo ogni render del componente che lo usa.
 */
export function useFocusRecovery(items: string) {
  const pending = useRef<Pending | null>(null);

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    if (p.from.isConnected) {
      if (Date.now() - p.at > EXPIRY_MS) pending.current = null;
      return;
    }
    pending.current = null;
    // Qualcun altro ha già spostato il focus (es. un pannello che si apre): lo si lascia lì.
    if (document.activeElement && document.activeElement !== document.body) return;
    for (const item of p.neighbours) {
      if (!item.isConnected || !item.checkVisibility()) continue;
      const own = controls(item);
      return (own[p.position] ?? own.at(-1) ?? item).focus();
    }
    for (const ancestor of p.ancestors) {
      if (!ancestor.isConnected) continue;
      const first = controls(ancestor)[0];
      if (first) return first.focus();
    }
  });

  return () => {
    const from = document.activeElement;
    if (!(from instanceof HTMLElement) || from === document.body) return;
    const item = from.closest<HTMLElement>(items);
    const siblings = item?.parentElement ? [...item.parentElement.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.matches(items)) : [];
    const index = item ? siblings.indexOf(item) : -1;
    const ancestors: HTMLElement[] = [];
    for (let el = (item ?? from).parentElement; el && el !== document.body; el = el.parentElement) ancestors.push(el);
    pending.current = {
      from,
      neighbours: item ? [...siblings.slice(index + 1), ...siblings.slice(0, index).reverse()] : [],
      position: item ? controls(item).indexOf(from) : -1,
      ancestors,
      at: Date.now(),
    };
  };
}
