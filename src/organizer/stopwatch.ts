import type { Phase, Timings } from '../shared/types';

export interface Stopwatch {
  /** Chiude la fase in corso: il tempo dall'ultimo `lap` (o dall'avvio) va alla fase indicata. */
  lap(phase: Phase): void;
  /** Le fasi chiuse finora e il tempo totale dall'avvio. */
  timings(): Timings;
}

/**
 * Cronometro di un calcolo: dice dove va il tempo (lettura del browser, descrizioni, Classificatore,
 * Generatore, dominio). I tempi finiscono nel log del service worker e nella proposta, così gli
 * script di prova li leggono senza strumenti a parte.
 */
export function createStopwatch(now: () => number = () => performance.now()): Stopwatch {
  const start = now();
  let last = start;
  const phases: Timings = {};
  return {
    lap(phase) {
      const t = now();
      phases[phase] = (phases[phase] ?? 0) + Math.round(t - last);
      last = t;
    },
    timings: () => ({ ...phases, total: Math.round(now() - start) }),
  };
}
