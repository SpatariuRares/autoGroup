/// <reference types="dom-chromium-ai" />
import { GROUPS_SCHEMA, parseGroups, systemPrompt, userPrompt } from './prompt';
import { ProviderError, type AiOption, type AiTab, type GenerateRequest, type Generator, type RawGroup } from './types';

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

    async generate(request: GenerateRequest, signal?: AbortSignal): Promise<RawGroup[]> {
      let base: Session;
      try {
        base = await LanguageModel.create({
          initialPrompts: [{ role: 'system', content: systemPrompt(request) }],
          signal,
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new ProviderError('unavailable', String(err));
      }
      try {
        const budget = Math.floor((contextWindow(base) - contextUsage(base)) * (1 - RESPONSE_RESERVE));
        const results: RawGroup[] = [];
        const invented: AiOption[] = [];
        for (const block of await splitIntoBlocks(base, request, budget)) {
          const options = [...request.options, ...invented];
          const session = await base.clone({ signal });
          try {
            let content: string;
            try {
              content = await session.prompt(userPrompt({ ...request, options, tabs: block }), {
                responseConstraint: GROUPS_SCHEMA,
                signal,
              });
            } catch (err) {
              if (signal?.aborted) throw err;
              throw new ProviderError('invalid-request', String(err));
            }
            const groups = parseGroups(content);
            if (!groups) throw new ProviderError('invalid-response', 'JSON fuori schema');
            for (const group of groups as RawGroup[]) {
              results.push(group);
              const name = typeof group?.name === 'string' ? group.name.trim() : '';
              const known = [...options].some((o) => o.name.toLocaleLowerCase() === name.toLocaleLowerCase());
              if (name && !known) invented.push({ name, description: '' });
            }
          } finally {
            session.destroy();
          }
        }
        return results;
      } finally {
        base.destroy();
      }
    },
  };
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
