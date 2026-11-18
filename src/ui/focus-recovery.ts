import { useLayoutEffect, useRef } from 'react';

/** After how long a memory is no longer useful: the action did not remove the element, or removed it much later. */
const EXPIRY_MS = 10_000;

const FOCUSABLE = 'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], summary';

/** The visible controls inside an element, in the order Tab reaches them. */
const controls = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((c) => c.checkVisibility());

interface Pending {
  from: HTMLElement;
  /** The items next to the starting one: first the following ones, then the preceding ones starting from the closest. */
  neighbours: HTMLElement[];
  /** Position of the starting control within its item, to land on the same one (e.g. from ✕ to ✕). */
  position: number;
  /** The containers of the item, closest first: the last resort if no item is left. */
  ancestors: HTMLElement[];
  at: number;
}

/**
 * If a click or a choice removes from the page the control that has focus (close a tab, remove a site,
 * delete a category…), focus would go to the body and keyboard or screen reader users would start over.
 * This hook moves it to the same control of the adjacent item (`items` is the selector of the items), or to the
 * first control of the closest remaining container. It returns the handler to put on onClickCapture and
 * onChangeCapture of the root; the restore happens after every render of the component that uses it.
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
    // Someone else has already moved focus (e.g. a panel that opens): leave it there.
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
