import { postJson, TIMINGS } from './http';
import { cleanDescription, describePrompt, GROUPS_SCHEMA, parseGroups, systemPrompt, userPrompt } from './prompt';
import { ProviderError, type DescribeRequest, type GenerateRequest, type Generator, type RawGroup } from './types';

/**
 * Tetto ai token della risposta di `generate`, ragionamento compreso. La risposta utile è piccola
 * (nomi e ID brevi); il tetto serve con i modelli che ragionano: dopo un timeout un server locale
 * può continuare a generare per minuti (misurato: oltre 13 con 30 tab) e tenere occupata la GPU
 * per il calcolo successivo. Con il tetto si ferma da solo.
 */
export const GENERATE_MAX_TOKENS = 4096;

export interface OpenAiGeneratorConfig {
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Tempo massimo per richiesta, in ms. */
  timeoutMs?: number;
}

/**
 * Generatore su protocollo compatibile OpenAI (`POST {baseUrl}/chat/completions`): OpenRouter,
 * Ollama, LM Studio o qualunque server compatibile. Chiede la risposta vincolata dallo schema JSON;
 * se il server rifiuta `response_format` ritenta senza, affidandosi alle istruzioni e alla validazione.
 */
export function createOpenAiGenerator(config: OpenAiGeneratorConfig): Generator {
  async function chat(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ content: string; truncated: boolean }> {
    const json = (await postJson(
      `${config.baseUrl}/chat/completions`,
      { model: config.model, ...body },
      { apiKey: config.apiKey, timeoutMs: config.timeoutMs ?? TIMINGS.generator, signal },
    )) as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] };
    const choice = json?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== 'string') throw new ProviderError('invalid-response', 'risposta senza contenuto');
    return { content, truncated: choice?.finish_reason === 'length' };
  }

  return {
    label: config.label,

    async generate(request: GenerateRequest, signal?: AbortSignal): Promise<RawGroup[]> {
      const messages = [
        { role: 'system', content: systemPrompt(request) },
        { role: 'user', content: userPrompt(request) },
      ];
      const structured = {
        type: 'json_schema',
        json_schema: { name: 'tab_groups', strict: true, schema: GROUPS_SCHEMA },
      };
      let content: string;
      try {
        ({ content } = await chat({ messages, temperature: 0, max_tokens: GENERATE_MAX_TOKENS, response_format: structured }, signal));
      } catch (err) {
        // Alcuni server non supportano lo structured output, e alcuni modelli (es. i modelli di
        // ragionamento di OpenAI) rifiutano `max_tokens`: si ritenta una volta con la richiesta minima.
        if (!(err instanceof ProviderError) || err.status !== 400) throw err;
        ({ content } = await chat({ messages, temperature: 0 }, signal));
      }
      // Una risposta tagliata dal tetto non è JSON completo: la lettura la scarta come non valida.
      const groups = parseGroups(content);
      if (!groups) throw new ProviderError('invalid-response', 'JSON fuori schema');
      return groups as RawGroup[];
    },

    async describe(request: DescribeRequest, signal?: AbortSignal): Promise<string> {
      const { system, user } = describePrompt(request);
      // Il limite comprende anche il "ragionamento" dei modelli che lo usano (es. Unsloth Studio):
      // con 120 token la frase arrivava tagliata a metà. Gli altri modelli si fermano da soli dopo la frase.
      const { content, truncated } = await chat(
        { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 1000 },
        signal,
      );
      // Una frase tagliata non va salvata come descrizione: meglio vuota, da completare nelle impostazioni.
      if (truncated) throw new ProviderError('invalid-response', 'descrizione troncata');
      return cleanDescription(content);
    },
  };
}

/** "Prova connessione": una richiesta minima che verifica URL, chiave e modello. */
export async function testOpenAiConnection(config: OpenAiGeneratorConfig): Promise<void> {
  await postJson(
    `${config.baseUrl}/chat/completions`,
    { model: config.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
    { apiKey: config.apiKey, timeoutMs: config.timeoutMs ?? TIMINGS.generator },
  );
}
