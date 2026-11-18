import { ProviderError } from './types';

/**
 * AI provider timeouts, in one place. Tests shorten them so they don't actually wait.
 * - `classifier` / `generator`: timeout per request (PRD: 5 s and 30 s);
 * - `retryDelay`: wait before the single retry.
 */
export const TIMINGS = {
  classifier: 5_000,
  generator: 30_000,
  retryDelay: 800,
};

/**
 * Signal that expires after `ms`, combined with the one from "Stop". Uses an explicit `setTimeout`
 * instead of `AbortSignal.timeout`: a signal combined with `AbortSignal.any` is held only by weak
 * references, and if the request stays pending the timeout can be garbage-collected without
 * ever firing. `done()` must be called at the end to free the timer.
 */
export function deadline(ms: number, signal?: AbortSignal) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new DOMException('timeout', 'TimeoutError')), ms);
  return {
    signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    /** True if the time has run out (and "Stop" was not pressed). */
    get expired() {
      return timeout.signal.aborted && !signal?.aborted;
    },
    done: () => clearTimeout(timer),
  };
}

/** Classifies a failed HTTP response into the cause of the warning. */
function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('invalid-key', `HTTP ${status}`, status);
  if (status === 429 || status === 529) return new ProviderError('rate-limit', `HTTP ${status}`, status);
  if (status === 400 || status === 404 || status === 422) return new ProviderError('invalid-request', `HTTP ${status}`, status);
  return new ProviderError('unreachable', `HTTP ${status}`, status);
}

/** Only transient errors deserve a new attempt: 429, 529 and 5xx. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ProviderError) || err.status === undefined) return false;
  return err.status === 429 || err.status === 529 || err.status >= 500;
}

interface PostJsonOptions {
  apiKey?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Waits `ms`, but stops immediately if "Stop" arrives. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

async function postOnce(url: string, body: unknown, options: PostJsonOptions): Promise<unknown> {
  const time = deadline(options.timeoutMs, options.signal);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: time.signal,
      });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      if (time.expired) throw new ProviderError('timeout', 'timeout');
      throw new ProviderError('unreachable', String(err));
    }
    if (!response.ok) throw errorForStatus(response.status);
    try {
      return await response.json();
    } catch (err) {
      if (options.signal?.aborted) throw err;
      if (time.expired) throw new ProviderError('timeout', 'timeout');
      throw new ProviderError('invalid-response', 'risposta non JSON');
    }
  } finally {
    time.done();
  }
}

/**
 * POST JSON to an AI provider, shared by all adapters: key as `Bearer` (if any),
 * per-request timeout, **a single new attempt** after a short wait for 429, 529 and 5xx,
 * and every error turned into a `ProviderError` with its cause. 401, 403, 422, network errors and
 * timeouts are not retried. A deliberate interruption (`signal`) is rethrown as is.
 */
export async function postJson(url: string, body: unknown, options: PostJsonOptions): Promise<unknown> {
  try {
    return await postOnce(url, body, options);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    await wait(TIMINGS.retryDelay, options.signal);
    return postOnce(url, body, options);
  }
}
