import { vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cleanUrl } from '../src/organizer/ai-input';
import { isExcluded, isInternalUrl } from '../src/organizer/tab-selection';
import { loadSettings } from '../src/settings';

/**
 * Pagine del browser o di domini esclusi trovate in una richiesta a un provider: `privacy.md` promette
 * che non escono mai. Ogni richiesta di `installFakeFetch` viene controllata; `tests/setup.ts` fa
 * fallire il test che ne lascia una qui (un errore dentro `fetch` sembrerebbe un provider che non
 * risponde, e il test passerebbe).
 */
export const privacyViolations: string[] = [];

/** Ogni indirizzo nel corpo (con il titolo, se c'è), anche dentro i messaggi che sono testo JSON. */
function sentTabs(value: unknown, found: { title?: string; url: string }[] = []) {
  if (typeof value === 'string') {
    if (/^\s*[[{]/.test(value)) {
      try {
        sentTabs(JSON.parse(value), found);
      } catch {
        // Testo che sembra JSON ma non lo è: nessuna tab dentro.
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) sentTabs(item, found);
  } else if (value && typeof value === 'object') {
    const { title, url } = value as Record<string, unknown>;
    if (typeof url === 'string') found.push({ url, ...(typeof title === 'string' ? { title } : {}) });
    for (const item of Object.values(value)) sentTabs(item, found);
  }
  return found;
}

async function checkPrivacy(request: RecordedRequest) {
  const tabs = await browser.tabs.query({}).catch(() => []);
  const { excludedDomains } = await loadSettings();
  const forbidden = new Set(
    tabs.filter((t) => isInternalUrl(t.url) || isExcluded(t.url!, excludedDomains)).map((t) => `${t.title}\n${cleanUrl(t.url ?? '')}`),
  );
  const found = (what: string) => privacyViolations.push(`${request.url}: ${what}`);
  for (const tab of sentTabs(request.body)) {
    // Una pagina del browser ridotta da `cleanUrl` non ha più lo schema: la si riconosce con il titolo.
    if (tab.title !== undefined && forbidden.has(`${tab.title}\n${tab.url}`)) found(`«${tab.title}» (${tab.url})`);
    // Un dominio escluso si riconosce dall'indirizzo, anche senza titolo.
    else if (isExcluded(tab.url.includes('://') ? tab.url : `https://${tab.url}`, excludedDomains)) found(`dominio escluso (${tab.url})`);
  }
  // Un indirizzo interno scritto per intero, in qualunque punto del corpo.
  const scheme = JSON.stringify(request.body).match(/(chrome|chrome-extension):\/\/[^\s"\\]*|about:(blank|newtab|srcdoc)/);
  if (scheme) found(`pagina del browser (${scheme[0]})`);
}

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
    await checkPrivacy(request);
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
