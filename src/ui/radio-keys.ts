import type { KeyboardEvent } from 'react';

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Arrow keys, Home and End inside a role="radiogroup" made of role="radio" buttons: they move focus between the
 * options (wrapping around, from the last to the first). Choosing stays on Enter or Space, because here choosing has an
 * effect (recolors the group, recomputes the proposal). It works with a single tab stop: tabIndex 0 on the chosen option
 * and -1 on the others.
 */
export function moveInRadioGroup(e: KeyboardEvent<HTMLElement>) {
  if (!(e.key in STEP) && e.key !== 'Home' && e.key !== 'End') return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')];
  const index = radios.indexOf(e.target as HTMLElement);
  if (index < 0) return;
  e.preventDefault();
  const last = radios.length - 1;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? last : (index + STEP[e.key]! + radios.length) % radios.length;
  radios[next]!.focus();
}
