import { beforeEach } from 'vitest';
import { TIMINGS } from '../src/ai/http';

/** Tempi reali dei provider (PRD: 5 s, 30 s, breve attesa), accorciati per i test. */
const REAL = { ...TIMINGS };

beforeEach(() => {
  Object.assign(TIMINGS, { classifier: 200, generator: 200, retryDelay: 1 });
});

export { REAL as REAL_TIMINGS };
