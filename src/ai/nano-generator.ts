/// <reference types="dom-chromium-ai" />
import { browser } from 'wxt/browser';
import { deadline, TIMINGS } from './http';
import { cleanDescription, describePrompt, GROUPS_SCHEMA, parseGroups, systemPrompt, userPrompt } from './prompt';
import { ProviderError, type AiOption, type AiTab, type DescribeRequest, type GenerateRequest, type Generator, type RawGroup } from './types';

export const NANO_LABEL = 'Gemini Nano';

/** Gemini Nano status: available, to be downloaded, downloading or unsupported. */
export type NanoAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** Languages Gemini Nano can answer in (Chrome's Prompt API). */
const NANO_LANGUAGES: Record<string, string> = { de: 'German', en: 'English', es: 'Spanish', fr: 'French', ja: 'Japanese' };

/**
 * Nano's answer language: the browser's if Nano supports it, otherwise English.
 * Chrome asks for it to be declared on every `availability()` and `create()`, otherwise it warns in the console.
 */
export function nanoLanguage(): string {
  const ui = browser.i18n.getUILanguage().toLowerCase().split('-')[0]!;
  return ui in NANO_LANGUAGES ? ui : 'en';
}

/** Languages declared to the Prompt API: tabs can be in Nano's language or in English. */
function languageOptions() {
  const language = nanoLanguage();
  return {
    expectedInputs: [{ type: 'text' as const, languages: [...new Set([language, 'en'])] }],
    expectedOutputs: [{ type: 'text' as const, languages: [language] }],
  };
}

/**
 * The language of the names requested in the prompt: if the browser is set to a language Nano does not
 * support (e.g. Italian), group names come back in English, consistent with the declared language.
 */
function withNanoLanguage<T extends { language: string }>(request: T): T {
  const ui = browser.i18n.getUILanguage().toLowerCase().split('-')[0]!;
  return ui in NANO_LANGUAGES ? request : { ...request, language: NANO_LANGUAGES.en! };
}

/** Gemini Nano availability through the Prompt API; "unavailable" if the API does not exist. */
export async function nanoAvailability(): Promise<NanoAvailability> {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability(languageOptions());
  } catch {
    return 'unavailable';
  }
}

/** Starts the model download (requires a user gesture) and reports its progress, from 0 to 1. */
export async function downloadNano(onProgress: (fraction: number) => void): Promise<void> {
  const session = await LanguageModel.create({
    ...languageOptions(),
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress(e.loaded));
    },
  });
  session.destroy();
}

/** Share of the context left free for the response. */
const RESPONSE_RESERVE = 0.25;

type Session = LanguageModel;

const contextWindow = (s: Session) => s.contextWindow ?? s.inputQuota;
const contextUsage = (s: Session) => s.contextUsage ?? s.inputUsage ?? 0;
const measure = (s: Session, text: string) =>
  typeof s.measureContextUsage === 'function' ? s.measureContextUsage(text) : s.measureInputUsage(text);

/**
 * Generator built into Chrome (Gemini Nano, Prompt API), with the same contract as the OpenAI-compatible
 * Generator. No key, and no data leaves the computer.
 *
 * Nano's context is small: if the tabs don't fit, they are sent in blocks, each in a new
 * session, and the names invented in earlier blocks become options for the later blocks.
 */
export function createNanoGenerator(): Generator {
  return {
    label: NANO_LABEL,
    generate: (request, signal) => generate(withNanoLanguage(request), signal),
    prepare(mode, language) {
      baseSession(systemPrompt(withNanoLanguage({ mode, language, tabs: [], options: [] }))).catch(() => {});
    },
    describe: (request, signal) => withTimeout(signal, (s) => describe(withNanoLanguage(request), s)),
  };
}

/**
 * Applies to every call to Nano the same maximum time as a request to the OpenAI-compatible
 * Generator: when it runs out, the call is interrupted with a `ProviderError('timeout')`. With several blocks
 * each one has its own time, like every HTTP request. "Stop" passes through as is.
 */
async function withTimeout<T>(signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const time = deadline(TIMINGS.generator, signal);
  try {
    return await run(time.signal);
  } catch (err) {
    if (time.expired) throw new ProviderError('timeout', 'timeout');
    throw err;
  } finally {
    time.done();
  }
}

/** A Prompt API error that is not an interruption becomes a `ProviderError` with the given cause. */
function asProviderError(err: unknown, signal: AbortSignal, reason: 'unavailable' | 'invalid-request'): unknown {
  if (signal.aborted || err instanceof ProviderError) return err;
  return new ProviderError(reason, String(err));
}

/** Base sessions already created, one per system prompt. Bound to the `LanguageModel` object, which the tests replace. */
const baseSessions = new WeakMap<object, Map<string, Promise<Session>>>();
/** One per mode and language is enough; beyond that, the oldest is destroyed. */
const MAX_BASE_SESSIONS = 4;

/**
 * The session with the system prompt, created once and then reused: it never receives a prompt,
 * it is only measured and cloned for each block, so it stays clean. Creating it loads the model and
 * reads the system prompt; `prepare` starts it while the pipeline reads the pages or queries the
 * Classifier, and the later computations find it ready as long as the service worker stays alive.
 */
function baseSession(system: string): Promise<Session> {
  let sessions = baseSessions.get(LanguageModel);
  if (!sessions) baseSessions.set(LanguageModel, (sessions = new Map()));
  const existing = sessions.get(system);
  if (existing) return existing;
  const created = LanguageModel.create({ ...languageOptions(), initialPrompts: [{ role: 'system', content: system }] });
  sessions.set(system, created);
  created.catch(() => forgetBase(system, created));
  if (sessions.size > MAX_BASE_SESSIONS) {
    const [oldest] = sessions.keys();
    forgetBase(oldest!, sessions.get(oldest!)!);
  }
  return created;
}

/** Removes a base session from the cache (if it is still the same one) and destroys it when ready. */
function forgetBase(system: string, session: Promise<Session>): void {
  const sessions = baseSessions.get(LanguageModel);
  if (sessions?.get(system) === session) sessions.delete(system);
  session.then((s) => s.destroy(), () => {});
}

/** Waits for `promise`, but stops immediately if the signal is aborted (the promise stays valid for the others). */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function generate(request: GenerateRequest, signal?: AbortSignal): Promise<RawGroup[]> {
  const system = systemPrompt(request);
  const pending = baseSession(system);
  const base = await withTimeout(signal, async (s) => {
    try {
      return await untilAborted(pending, s);
    } catch (err) {
      // A creation that timed out or failed must not be reused: the next computation creates a new one.
      if (!signal?.aborted) forgetBase(system, pending);
      throw asProviderError(err, s, 'unavailable');
    }
  });
  try {
    const budget = Math.floor((contextWindow(base) - contextUsage(base)) * (1 - RESPONSE_RESERVE));
    const results: RawGroup[] = [];
    const invented: AiOption[] = [];
    const blocks = await withTimeout(signal, async (s) => {
      try {
        return await splitIntoBlocks(base, request, budget);
      } catch (err) {
        throw asProviderError(err, s, 'invalid-request');
      }
    });
    for (const block of blocks) {
      const options = [...request.options, ...invented];
      const groups = await withTimeout(signal, (s) => promptBlock(base, { ...request, options, tabs: block }, s));
      for (const group of groups) {
        results.push(group);
        const name = typeof group?.name === 'string' ? group.name.trim() : '';
        const known = options.some((o) => o.name.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (name && !known) invented.push({ name, description: '' });
      }
    }
    return results;
  } catch (err) {
    // The base session may no longer be valid (e.g. destroyed by Chrome): it is not reused.
    if (!signal?.aborted) forgetBase(system, pending);
    throw err;
  }
}

/** A block of tabs in a copy of the base session, which already has the system prompt. */
async function promptBlock(base: Session, request: GenerateRequest, signal: AbortSignal): Promise<RawGroup[]> {
  let content: string;
  let session: Session | undefined;
  try {
    session = await base.clone({ signal });
    content = await session.prompt(userPrompt(request), { responseConstraint: GROUPS_SCHEMA, signal });
  } catch (err) {
    throw asProviderError(err, signal, 'invalid-request');
  } finally {
    session?.destroy();
  }
  const groups = parseGroups(content);
  if (!groups) throw new ProviderError('invalid-response', 'JSON outside the schema');
  return groups as RawGroup[];
}

async function describe(request: DescribeRequest, signal: AbortSignal): Promise<string> {
  const { system, user } = describePrompt(request);
  let session: Session;
  try {
    session = await LanguageModel.create({ ...languageOptions(), initialPrompts: [{ role: 'system', content: system }], signal });
  } catch (err) {
    throw asProviderError(err, signal, 'unavailable');
  }
  try {
    return cleanDescription(await session.prompt(user, { signal }));
  } catch (err) {
    throw asProviderError(err, signal, 'invalid-request');
  } finally {
    session.destroy();
  }
}

/**
 * Splits the tabs into blocks that fit the context: each block, with the options and a margin for
 * the names that will be added, must stay within `budget`. A block always contains at least one tab.
 */
async function splitIntoBlocks(session: Session, request: GenerateRequest, budget: number): Promise<AiTab[][]> {
  const whole = await measure(session, userPrompt(request));
  if (whole <= budget) return [request.tabs];

  // All the measurements together: each one is a call to the model, queued they would cost N rounds.
  const [fixed, costs] = await Promise.all([
    measure(session, userPrompt({ ...request, tabs: [] })),
    Promise.all(request.tabs.map((tab) => measure(session, JSON.stringify(tab)))),
  ]);
  const blocks: AiTab[][] = [];
  let current: AiTab[] = [];
  let used = fixed;
  for (const [i, tab] of request.tabs.entries()) {
    const cost = costs[i]!;
    // Margin for the names invented in the earlier blocks, added to the options.
    const reserve = blocks.length * 16;
    if (current.length > 0 && used + cost + reserve > budget) {
      blocks.push(current);
      current = [];
      used = fixed;
    }
    current.push(tab);
    used += cost;
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}
