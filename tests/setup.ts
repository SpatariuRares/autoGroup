import { afterEach, beforeEach, expect } from 'vitest';
import { TIMINGS } from '../src/ai/http';
import { privacyViolations } from './fake-network';

/** Tempi reali dei provider (PRD: 5 s, 30 s, breve attesa), accorciati per i test. */
const REAL = { ...TIMINGS };

beforeEach(() => {
  Object.assign(TIMINGS, { classifier: 200, generator: 200, retryDelay: 1 });
});

// Nessuna pagina del browser o di un dominio escluso deve arrivare a un provider (vedi `privacyViolations`).
afterEach(() => {
  const found = privacyViolations.splice(0);
  expect(found, 'pagine del browser o di domini esclusi inviate a un provider').toEqual([]);
});

export { REAL as REAL_TIMINGS };
