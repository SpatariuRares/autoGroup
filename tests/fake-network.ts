import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

/** Permessi host opzionali: `granted` contiene i pattern concessi, es. "https://openrouter.ai/*". */
export function installFakePermissions(granted: string[] = []) {
  const origins = new Set(granted);
  Object.assign(fakeBrowser.permissions, {
    async contains(p: { origins?: string[] }) {
      return (p.origins ?? []).every((o) => origins.has(o));
    },
    async request(p: { origins?: string[] }) {
      for (const o of p.origins ?? []) origins.add(o);
      return true;
    },
    async remove(p: { origins?: string[] }) {
      for (const o of p.origins ?? []) origins.delete(o);
      return true;
    },
    async getAll() {
      return { origins: [...origins], permissions: [] };
    },
  });
  return origins;
}

export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  body: any;
  signal?: AbortSignal;
}

/** Una risposta che non arriva mai: la richiesta finisce solo per timeout o "Interrompi". */
export const HANG = () => new Promise<never>(() => {});

type Reply = Response | Error | ((request: RecordedRequest) => Response | Error | Promise<Response | Error>);

/** Sostituisce `fetch`: ogni chiamata consuma la prossima risposta in coda e viene registrata. */
export function installFakeFetch(...replies: Reply[]) {
  const requests: RecordedRequest[] = [];
  const queue = [...replies];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: RecordedRequest = {
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      signal: init?.signal ?? undefined,
    };
    requests.push(request);
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (!next) throw new Error('fetch inatteso');
    // Come il fetch vero: un segnale interrotto fa fallire subito la richiesta.
    const aborted = new Promise<never>((_, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    // Se la risposta arriva prima, nessuno ascolta più questa promessa: niente rifiuti non gestiti.
    aborted.catch(() => {});
    const reply = typeof next === 'function' ? await Promise.race([next(request), aborted]) : next;
    if (reply instanceof Error) throw reply;
    return reply.clone();
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, fetchMock };
}

/** Risposta di /chat/completions nel formato OpenAI con il contenuto indicato. */
export function openAiReply(content: unknown, status = 200): Response {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function httpError(status: number): Response {
  return new Response(JSON.stringify({ error: { message: `HTTP ${status}` } }), { status });
}

/** Risposta di /v1/systemone: per ogni domanda una scelta con la sua confidenza. */
export function systemOneReply(answers: Record<string, { choice: string; confidence: number }>): Response {
  const body = {
    model: 'jev-latest',
    answers: Object.fromEntries(
      Object.entries(answers).map(([name, a]) => [name, { type: 'choice', choice: a.choice, confidence: a.confidence, probabilities: { [a.choice]: a.confidence } }]),
    ),
    usage: { input_tokens: 10, output_tokens: 1 },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
