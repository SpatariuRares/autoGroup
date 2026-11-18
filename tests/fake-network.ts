import { vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { cleanUrl } from '../src/organizer/ai-input';
import { isExcluded, isInternalUrl } from '../src/organizer/tab-selection';
import { loadSettings } from '../src/settings';

/**
 * Browser pages or excluded domains found in a request to a provider: `privacy.md` promises
 * that they never leave. Every request of `installFakeFetch` is checked; `tests/setup.ts` makes
 * the test that leaves one here fail (an error inside `fetch` would look like a provider that does
 * not respond, and the test would pass).
 */
export const privacyViolations: string[] = [];

/** Every address in the body (with the title, if any), also inside messages that are JSON text. */
function sentTabs(value: unknown, found: { title?: string; url: string }[] = []) {
  if (typeof value === 'string') {
    if (/^\s*[[{]/.test(value)) {
      try {
        sentTabs(JSON.parse(value), found);
      } catch {
        // Text that looks like JSON but is not: no tab inside.
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
    // A browser page reduced by `cleanUrl` no longer has its scheme: it is recognized by the title.
    if (tab.title !== undefined && forbidden.has(`${tab.title}\n${tab.url}`)) found(`«${tab.title}» (${tab.url})`);
    // An excluded domain is recognized from the address, even without a title.
    else if (isExcluded(tab.url.includes('://') ? tab.url : `https://${tab.url}`, excludedDomains)) found(`dominio escluso (${tab.url})`);
  }
  // An internal address written in full, anywhere in the body.
  const scheme = JSON.stringify(request.body).match(/(chrome|chrome-extension):\/\/[^\s"\\]*|about:(blank|newtab|srcdoc)/);
  if (scheme) found(`pagina del browser (${scheme[0]})`);
}

/** Optional host permissions: `granted` contains the granted patterns, e.g. "https://openrouter.ai/*". */
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

/** A reply that never arrives: the request ends only by timeout or "Stop". */
export const HANG = () => new Promise<never>(() => {});

type Reply = Response | Error | ((request: RecordedRequest) => Response | Error | Promise<Response | Error>);

/** Replaces `fetch`: each call consumes the next reply in the queue and is recorded. */
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
    // Like the real fetch: an aborted signal makes the request fail immediately.
    const aborted = new Promise<never>((_, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    // If the reply arrives first, nobody listens to this promise any more: no unhandled rejections.
    aborted.catch(() => {});
    const reply = typeof next === 'function' ? await Promise.race([next(request), aborted]) : next;
    if (reply instanceof Error) throw reply;
    return reply.clone();
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, fetchMock };
}

/** /chat/completions reply in the OpenAI format with the given content. */
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

/** /v1/systemone reply: for each question, a choice with its confidence. */
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
