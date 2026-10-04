import { ProviderError } from './types';

/**
 * Tempi dei provider AI, in un unico punto. I test li accorciano per non aspettare davvero.
 * - `classifier` / `generator`: timeout per richiesta (PRD: 5 s e 30 s);
 * - `retryDelay`: attesa prima dell'unico nuovo tentativo.
 */
export const TIMINGS = {
  classifier: 5_000,
  generator: 30_000,
  retryDelay: 800,
};

/**
 * Segnale che scade dopo `ms`, unito a quello di "Interrompi". Usa un `setTimeout` esplicito invece
 * di `AbortSignal.timeout`: un segnale combinato con `AbortSignal.any` è tenuto solo con riferimenti
 * deboli, e se la richiesta resta appesa il timeout può essere raccolto dal garbage collector senza
 * mai scattare. `done()` va chiamato alla fine per liberare il timer.
 */
export function deadline(ms: number, signal?: AbortSignal) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new DOMException('timeout', 'TimeoutError')), ms);
  return {
    signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    /** Vero se è scaduto il tempo (e non è stato premuto "Interrompi"). */
    get expired() {
      return timeout.signal.aborted && !signal?.aborted;
    },
    done: () => clearTimeout(timer),
  };
}

/** Classifica una risposta HTTP non riuscita nella causa dell'avviso. */
function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('invalid-key', `HTTP ${status}`, status);
  if (status === 429 || status === 529) return new ProviderError('rate-limit', `HTTP ${status}`, status);
  if (status === 400 || status === 404 || status === 422) return new ProviderError('invalid-request', `HTTP ${status}`, status);
  return new ProviderError('unreachable', `HTTP ${status}`, status);
}

/** Solo gli errori temporanei meritano un nuovo tentativo: 429, 529 e 5xx. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ProviderError) || err.status === undefined) return false;
  return err.status === 429 || err.status === 529 || err.status >= 500;
}

interface PostJsonOptions {
  apiKey?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Attende `ms`, ma si interrompe subito se arriva "Interrompi". */
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
 * POST JSON verso un provider AI, comune a tutti gli adattatori: chiave come `Bearer` (se c'è),
 * timeout per richiesta, **un solo nuovo tentativo** dopo una breve attesa per 429, 529 e 5xx,
 * e ogni errore trasformato in `ProviderError` con la sua causa. 401, 403, 422, errori di rete e
 * timeout non vengono ritentati. Un'interruzione voluta (`signal`) viene rilanciata così com'è.
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
