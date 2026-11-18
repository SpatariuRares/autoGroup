import type { DescribeRequest, GenerateRequest } from './types';

/** JSON schema of the Generator's response: a list of groups with name and short tab IDs. */
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

/** System instructions for the Generator. */
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

/**
 * User message: known options and tabs, in compact JSON. In "new only" the options serve only to
 * avoid repeating their names, so they go without description: fewer tokens to process (and, with Gemini Nano,
 * more tabs per block).
 */
export function userPrompt(request: GenerateRequest): string {
  return JSON.stringify({
    options: request.mode === 'new-only' ? request.options.map((o) => o.name) : request.options,
    tabs: request.tabs,
  });
}

/** Extracts the list of groups from the response text, also accepting a ```json block. */
export function parseGroups(content: string): unknown[] | null {
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text) as { groups?: unknown };
    return Array.isArray(parsed?.groups) ? parsed.groups : null;
  } catch {
    return null;
  }
}

/** Maximum length of the generated description, equal to the categories' limit. */
export const MAX_DESCRIPTION_LENGTH = 300;

/** Instructions for "describe": one sentence saying what belongs in the category. */
export function describePrompt(request: DescribeRequest): { system: string; user: string } {
  return {
    system: [
      'You write the description of a category used to sort browser tabs.',
      `Write one sentence in ${request.language}, at most 25 words, listing the kinds of pages that belong to the category.`,
      'Reply with the sentence only, without quotes or a leading label.',
    ].join('\n'),
    user: JSON.stringify({ category: request.name, example_tabs: request.examples.map(({ title, url }) => ({ title, url })) }),
  };
}

/** Cleans up the generated description: quotes, spaces, maximum length. */
export function cleanDescription(text: string): string {
  return text
    .trim()
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH);
}
