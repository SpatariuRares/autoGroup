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
      return new FakeSession(this.system, this.contextWindow);
    }
    async prompt(input: string, opts?: { responseConstraint?: unknown }) {
      const parsed = JSON.parse(input);
      const call: NanoCall = { system: this.system, input, options: parsed.options, tabs: parsed.tabs, schema: opts?.responseConstraint };
      calls.push(call);
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
