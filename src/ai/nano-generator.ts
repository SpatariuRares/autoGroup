/// <reference types="dom-chromium-ai" />
import { deadline, TIMINGS } from './http';
import { cleanDescription, describePrompt, GROUPS_SCHEMA, parseGroups, systemPrompt, userPrompt } from './prompt';
import { ProviderError, type AiOption, type AiTab, type DescribeRequest, type GenerateRequest, type Generator, type RawGroup } from './types';

export const NANO_LABEL = 'Gemini Nano';

/** Stato di Gemini Nano: disponibile, da scaricare, in download o non supportato. */
export type NanoAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** Disponibilità di Gemini Nano tramite la Prompt API; "unavailable" se l'API non esiste. */
export async function nanoAvailability(): Promise<NanoAvailability> {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability();
  } catch {
    return 'unavailable';
  }
}

/** Avvia il download del modello (richiede un gesto dell'utente) e ne riporta l'avanzamento, da 0 a 1. */
export async function downloadNano(onProgress: (fraction: number) => void): Promise<void> {
  const session = await LanguageModel.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => onProgress(e.loaded));
    },
  });
  session.destroy();
}

/** Spazio del contesto lasciato libero per la risposta. */
const RESPONSE_RESERVE = 0.25;

type Session = LanguageModel;

const contextWindow = (s: Session) => s.contextWindow ?? s.inputQuota;
const contextUsage = (s: Session) => s.contextUsage ?? s.inputUsage ?? 0;
const measure = (s: Session, text: string) =>
  typeof s.measureContextUsage === 'function' ? s.measureContextUsage(text) : s.measureInputUsage(text);

/**
 * Generatore integrato in Chrome (Gemini Nano, Prompt API), con lo stesso contratto del Generatore
 * compatibile OpenAI. Nessuna chiave e nessun dato esce dal computer.
 *
 * Il contesto di Nano è piccolo: se le tab non ci stanno vengono inviate a blocchi, ognuno in una
 * sessione nuova, e i nomi inventati nei blocchi precedenti diventano opzioni dei blocchi successivi.
 */
export function createNanoGenerator(): Generator {
  return {
    label: NANO_LABEL,
    generate: (request, signal) => generate(request, signal),
    describe: (request, signal) => withTimeout(signal, (s) => describe(request, s)),
  };
}

/**
 * Applica a ogni chiamata a Nano lo stesso tempo massimo di una richiesta al Generatore compatibile
 * OpenAI: allo scadere la chiamata si interrompe con un `ProviderError('timeout')`. Con più blocchi
 * ognuno ha il suo tempo, come ogni richiesta HTTP. "Interrompi" passa così com'è.
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

/** Un errore della Prompt API che non è un'interruzione diventa un `ProviderError` con la causa data. */
function asProviderError(err: unknown, signal: AbortSignal, reason: 'unavailable' | 'invalid-request'): unknown {
  if (signal.aborted || err instanceof ProviderError) return err;
  return new ProviderError(reason, String(err));
}

async function generate(request: GenerateRequest, signal?: AbortSignal): Promise<RawGroup[]> {
  const base = await withTimeout(signal, async (s) => {
    try {
      return await LanguageModel.create({ initialPrompts: [{ role: 'system', content: systemPrompt(request) }], signal: s });
    } catch (err) {
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
  } finally {
    base.destroy();
  }
}

/** Un blocco di tab in una copia della sessione di base, che ha già il prompt di sistema. */
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
  if (!groups) throw new ProviderError('invalid-response', 'JSON fuori schema');
  return groups as RawGroup[];
}

async function describe(request: DescribeRequest, signal: AbortSignal): Promise<string> {
  const { system, user } = describePrompt(request);
  let session: Session;
  try {
    session = await LanguageModel.create({ initialPrompts: [{ role: 'system', content: system }], signal });
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
 * Divide le tab in blocchi che stanno nel contesto: ogni blocco, con le opzioni e un margine per
 * i nomi che verranno aggiunti, deve restare entro `budget`. Un blocco contiene sempre almeno una tab.
 */
async function splitIntoBlocks(session: Session, request: GenerateRequest, budget: number): Promise<AiTab[][]> {
  const whole = await measure(session, userPrompt(request));
  if (whole <= budget) return [request.tabs];

  const fixed = await measure(session, userPrompt({ ...request, tabs: [] }));
  const blocks: AiTab[][] = [];
  let current: AiTab[] = [];
  let used = fixed;
  for (const tab of request.tabs) {
    const cost = await measure(session, JSON.stringify(tab));
    // Margine per i nomi inventati nei blocchi precedenti, aggiunti alle opzioni.
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
