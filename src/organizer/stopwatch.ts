import type { Phase, Timings } from '../shared/types';

export interface Stopwatch {
  /** Closes the current phase: the time since the last `lap` (or since the start) goes to the given phase. */
  lap(phase: Phase): void;
  /** The phases closed so far and the total time since the start. */
  timings(): Timings;
}

/**
 * Stopwatch for a computation: it tells where the time goes (browser reading, descriptions, Classifier,
 * Generator, domain). The timings end up in the service worker log and in the proposal, so the test
 * scripts read them without separate tools.
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
