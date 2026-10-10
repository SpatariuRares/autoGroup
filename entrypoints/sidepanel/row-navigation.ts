import type { KeyboardEvent } from 'react';

const KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/** I controlli di una riga, nell'ordine in cui li raggiunge Tab. */
const controls = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('button, select')];

/**
 * Frecce su e giù tra le righe delle tab del pannello, Home e Fine per la prima e l'ultima: il focus va
 * sullo stesso controllo della riga di arrivo (es. da ✕ a ✕), o sulla riga se non ce l'ha. Nei menu
 * "Sposta in…" e nei campi di testo le frecce restano quelle native. Le righe dentro sezioni chiuse sono saltate.
 */
export function moveBetweenRows(e: KeyboardEvent<HTMLElement>) {
  if (!KEYS.has(e.key)) return;
  const target = e.target as HTMLElement;
  if (target.tagName === 'SELECT' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  const row = target.closest<HTMLElement>('.tab');
  if (!row) return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.tab')].filter((r) => r.checkVisibility());
  const index = rows.indexOf(row);
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.min(Math.max(index + (e.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1);
  if (next === index) return;
  e.preventDefault();
  const position = target === row ? -1 : controls(row).indexOf(target);
  const destination = rows[next]!;
  (controls(destination)[position] ?? destination).focus();
}
