import type { GenerateRequest } from './types';

/** Schema JSON della risposta del Generatore: un elenco di gruppi con nome e ID brevi delle tab. */
export const GROUPS_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tabs: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'tabs'],
        additionalProperties: false,
      },
    },
  },
  required: ['groups'],
  additionalProperties: false,
} as const;

/** Istruzioni di sistema per il Generatore. */
export function systemPrompt(request: GenerateRequest): string {
  const rules = [
    'You organize browser tabs into groups.',
    'Every tab has a short id (t1, t2, …), a title and a URL.',
    'Reply only with JSON: {"groups":[{"name":"…","tabs":["t1","t2"]}]}.',
    'Each tab id may appear in at most one group. Use only the given ids. Leave out tabs that fit nowhere.',
  ];
  if (request.mode === 'full') {
    rules.push(
      'Prefer the known options: when a tab fits one of them, use the option name exactly as written.',
      'When several tabs share a topic that no option covers, create a new group.',
    );
  } else {
    rules.push('Create new groups for tabs that share a topic. Do not reuse the known options.');
  }
  rules.push(`Names of new groups: at most 2 words, in ${request.language}, short and generic (a topic, not a site).`);
  return rules.join('\n');
}

/** Messaggio utente: opzioni note e tab, in JSON compatto. */
export function userPrompt(request: GenerateRequest): string {
  return JSON.stringify({
    options: request.options,
    tabs: request.tabs,
  });
}

/** Estrae l'elenco dei gruppi dal testo della risposta, accettando anche un blocco ```json. */
export function parseGroups(content: string): unknown[] | null {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text) as { groups?: unknown };
    return Array.isArray(parsed?.groups) ? parsed.groups : null;
  } catch {
    return null;
  }
}
