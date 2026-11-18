import { afterEach, beforeEach, expect } from 'vitest';
import { TIMINGS } from '../src/ai/http';
import { privacyViolations } from './fake-network';

/** Real provider timings (PRD: 5 s, 30 s, short wait), shortened for the tests. */
const REAL = { ...TIMINGS };

beforeEach(() => {
  Object.assign(TIMINGS, { classifier: 200, generator: 200, retryDelay: 1 });
});

// No browser page or excluded domain must reach a provider (see `privacyViolations`).
afterEach(() => {
  const found = privacyViolations.splice(0);
  expect(found, 'pagine del browser o di domini esclusi inviate a un provider').toEqual([]);
});

export { REAL as REAL_TIMINGS };
