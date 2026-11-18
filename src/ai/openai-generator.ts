import { postJson, TIMINGS } from './http';
import { cleanDescription, describePrompt, GROUPS_SCHEMA, parseGroups, systemPrompt, userPrompt } from './prompt';
import { ProviderError, type DescribeRequest, type GenerateRequest, type Generator, type RawGroup } from './types';

/**
 * Token cap for the response of `generate`, reasoning included. The useful response is small
 * (names and short IDs); the cap matters with reasoning models: after a timeout a local server
 * can keep generating for minutes (measured: over 13 with 30 tabs) and keep the GPU busy
 * for the next computation. With the cap, it stops by itself.
 */
export const GENERATE_MAX_TOKENS = 4096;

export interface OpenAiGeneratorConfig {
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Maximum time per request, in ms. */
  timeoutMs?: number;
}

/**
 * Generator on the OpenAI-compatible protocol (`POST {baseUrl}/chat/completions`): OpenRouter,
 * Ollama, LM Studio or any compatible server. Asks for the response constrained by the JSON schema;
 * if the server rejects `response_format` it retries without it, relying on the instructions and validation.
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
    if (typeof content !== 'string') throw new ProviderError('invalid-response', 'response without content');
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
        // Some servers don't support structured output, and some models (e.g. OpenAI's reasoning
        // models) reject `max_tokens`: it retries once with the minimal request.
        if (!(err instanceof ProviderError) || err.status !== 400) throw err;
        ({ content } = await chat({ messages, temperature: 0 }, signal));
      }
      // A response cut off by the cap is not complete JSON: reading it discards it as invalid.
      const groups = parseGroups(content);
      if (!groups) throw new ProviderError('invalid-response', 'JSON outside the schema');
      return groups as RawGroup[];
    },

    async describe(request: DescribeRequest, signal?: AbortSignal): Promise<string> {
      const { system, user } = describePrompt(request);
      // The limit also covers the "reasoning" of the models that use it (e.g. Unsloth Studio):
      // with 120 tokens the sentence came back cut in half. Other models stop by themselves after the sentence.
      const { content, truncated } = await chat(
        { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: 1000 },
        signal,
      );
      // A cut-off sentence must not be saved as a description: better empty, to be completed in the settings.
      if (truncated) throw new ProviderError('invalid-response', 'truncated description');
      return cleanDescription(content);
    },
  };
}

/** "Test connection": a minimal request that checks the URL, key and model. */
export async function testOpenAiConnection(config: OpenAiGeneratorConfig): Promise<void> {
  await postJson(
    `${config.baseUrl}/chat/completions`,
    { model: config.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
    { apiKey: config.apiKey, timeoutMs: config.timeoutMs ?? TIMINGS.generator },
  );
}
