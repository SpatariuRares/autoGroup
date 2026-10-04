import { postJson, TIMINGS } from './http';
import { cleanDescription, describePrompt, GROUPS_SCHEMA, parseGroups, systemPrompt, userPrompt } from './prompt';
import { ProviderError, type DescribeRequest, type GenerateRequest, type Generator, type RawGroup } from './types';

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
  async function chat(body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const json = (await postJson(
      `${config.baseUrl}/chat/completions`,
      { model: config.model, ...body },
      { apiKey: config.apiKey, timeoutMs: config.timeoutMs ?? TIMINGS.generator, signal },
    )) as { choices?: { message?: { content?: unknown } }[] };
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ProviderError('invalid-response', 'risposta senza contenuto');
    return content;
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
        content = await chat({ messages, temperature: 0, response_format: structured }, signal);
      } catch (err) {
        // Alcuni server non supportano lo structured output: si ritenta una volta senza.
        if (!(err instanceof ProviderError) || err.status !== 400) throw err;
        content = await chat({ messages, temperature: 0 }, signal);
      }
      const groups = parseGroups(content);
      if (!groups) throw new ProviderError('invalid-response', 'JSON fuori schema');
      return groups as RawGroup[];
    },

    async describe(request: DescribeRequest, signal?: AbortSignal): Promise<string> {
      const { system, user } = describePrompt(request);
      const content = await chat(
        { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 120 },
        signal,
      );
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
