import type { KeyboardEvent } from 'react';

const KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/** The controls of a row, in the order Tab reaches them. */
const controls = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('button, select')];

/**
 * Up and down arrows between the rows of the panel's tabs, Home and End for the first and the last: focus goes
 * to the same control of the arriving row (e.g. from ✕ to ✕), or to the row if it has none. In the
 * "Move to…" menus and in text fields the arrows remain the native ones. Rows inside closed sections are skipped.
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
