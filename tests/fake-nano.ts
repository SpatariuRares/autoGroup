import { vi } from 'vitest';

export interface NanoCall {
  system: string;
  input: string;
  /** Opzioni e tab del blocco, lette dal JSON del prompt. */
  options: { name: string }[];
  tabs: { id: string }[];
  schema: unknown;
}

export interface FakeNanoOptions {
  availability: 'available' | 'downloadable' | 'downloading' | 'unavailable';
  /** Dimensione del contesto, in "token" da 4 caratteri. */
  contextWindow?: number;
  /** Risposta del modello a ogni prompt, oppure un errore da lanciare. */
  respond?: (call: NanoCall) => unknown;
  /** Attesa prima di ogni risposta, in millisecondi. */
  delay?: number;
  /** Errore lanciato da `clone()`, come quando la sessione è stata distrutta. */
  cloneError?: Error;
}

/** Stub dell'oggetto globale LanguageModel (Prompt API di Chrome). */
export function installFakeNano(options: FakeNanoOptions) {
  const calls: NanoCall[] = [];
  const created = { count: 0 };
  const tokens = (text: string) => Math.ceil(text.length / 4);

  class FakeSession {
    constructor(
      readonly system: string,
      readonly contextWindow = options.contextWindow ?? 6000,
    ) {}
    get contextUsage() {
      return tokens(this.system);
    }
    async measureContextUsage(text: string) {
      return tokens(text);
    }
    async clone() {
      if (options.cloneError) throw options.cloneError;
      return new FakeSession(this.system, this.contextWindow);
    }
    async prompt(input: string, opts?: { responseConstraint?: unknown; signal?: AbortSignal }) {
      const parsed = JSON.parse(input);
      const call: NanoCall = { system: this.system, input, options: parsed.options, tabs: parsed.tabs, schema: opts?.responseConstraint };
      calls.push(call);
      // Come la Prompt API: un segnale interrotto durante l'attesa fa fallire la chiamata.
      if (options.delay) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, options.delay);
          opts?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(opts.signal!.reason);
          }, { once: true });
        });
      }
      const reply = (options.respond ?? (() => ({ groups: [] })))(call);
      if (reply instanceof Error) throw reply;
      return typeof reply === 'string' ? reply : JSON.stringify(reply);
    }
    destroy() {}
  }

  vi.stubGlobal('LanguageModel', {
    availability: vi.fn(async () => options.availability),
    create: vi.fn(async (o?: { initialPrompts?: { content: string }[] }) => {
      created.count++;
      return new FakeSession(o?.initialPrompts?.[0]?.content ?? '');
    }),
  });
  return { calls, created };
}
