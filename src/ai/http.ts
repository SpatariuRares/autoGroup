import { ProviderError } from './types';

/** Classifica una risposta HTTP non riuscita nella causa dell'avviso. */
export function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('invalid-key', `HTTP ${status}`, status);
  if (status === 429 || status === 529) return new ProviderError('rate-limit', `HTTP ${status}`, status);
  if (status === 400 || status === 404 || status === 422) return new ProviderError('invalid-request', `HTTP ${status}`, status);
  return new ProviderError('unreachable', `HTTP ${status}`, status);
}

export interface PostJsonOptions {
  apiKey?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * POST JSON verso un provider AI, comune a tutti gli adattatori: chiave come `Bearer` (se c'è),
 * timeout, e ogni errore trasformato in `ProviderError` con la sua causa. Un'interruzione voluta
 * (`signal`) viene rilanciata così com'è.
 */
export async function postJson(url: string, body: unknown, options: PostJsonOptions): Promise<unknown> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    if (timeout.aborted) throw new ProviderError('timeout', 'timeout');
    throw new ProviderError('unreachable', String(err));
  }
  if (!response.ok) throw errorForStatus(response.status);
  try {
    return await response.json();
  } catch {
    throw new ProviderError('invalid-response', 'risposta non JSON');
  }
}
