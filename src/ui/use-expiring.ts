import { useEffect, useRef, useState } from 'react';

/**
 * Valore che torna a `null` da solo dopo `ms` millisecondi (es. un'offerta nella snackbar). Il terzo
 * elemento va sparso sull'elemento che lo mostra: finché c'è sopra il mouse o dentro il focus il valore
 * resta, e uscendo il conto riparte da capo, così c'è sempre il tempo di leggere e scegliere.
 */
export function useExpiring<T>(ms: number) {
  const [value, setValue] = useState<T | null>(null);
  const [restarts, setRestarts] = useState(0);
  const holder = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (value === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      const el = holder.current;
      if (el?.isConnected && (el.matches(':hover') || el.contains(document.activeElement))) timer = setTimeout(expire, ms);
      else setValue(null);
    };
    timer = setTimeout(expire, ms);
    return () => clearTimeout(timer);
  }, [value, ms, restarts]);

  const restart = () => setRestarts((n) => n + 1);
  const hold = {
    ref: (el: HTMLElement | null) => {
      holder.current = el;
    },
    onMouseLeave: restart,
    onBlur: restart,
  };
  return [value, setValue, hold] as const;
}
