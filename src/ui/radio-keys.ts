import type { KeyboardEvent } from 'react';

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Frecce, Home e Fine dentro un role="radiogroup" fatto di pulsanti role="radio": spostano il focus tra le
 * opzioni (in giro, dall'ultima alla prima). Scegliere resta a Invio o Spazio, perché qui scegliere ha un
 * effetto (ricolora il gruppo, ricalcola la proposta). Va con un solo tab stop: tabIndex 0 sull'opzione
 * scelta e -1 sulle altre.
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
