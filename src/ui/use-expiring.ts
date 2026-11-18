import { useEffect, useRef, useState } from 'react';

/**
 * Value that returns to `null` by itself after `ms` milliseconds (e.g. an offer in the snackbar). The third
 * element is to be spread on the element that shows it: while the mouse is over it or focus is inside it the value
 * stays, and when you leave the countdown starts over, so there is always time to read and choose.
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
