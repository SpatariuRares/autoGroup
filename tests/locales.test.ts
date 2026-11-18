import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { NanoAvailability } from '../src/ai/nano-generator';
import { warningKey } from '../src/shared/i18n';
import { GROUP_COLORS, type Provenance, type ProposalWarning } from '../src/shared/types';

interface Message {
  message: string;
}

const load = (locale: string) =>
  JSON.parse(readFileSync(new URL(`../public/_locales/${locale}/messages.json`, import.meta.url), 'utf8')) as Record<string, unknown>;

/** All the interface languages, from the folders of public/_locales. */
const LOCALES = readdirSync(new URL('../public/_locales/', import.meta.url));

describe('translations', () => {
  it('all languages have the same keys, all in a format accepted by Chrome', () => {
    const it = Object.keys(load('it')).sort();
    for (const locale of LOCALES) expect(Object.keys(load(locale)).sort(), locale).toEqual(it);
    // Chrome refuses to load the extension if a key contains characters other than these.
    expect(it.filter((key) => !/^[A-Za-z0-9_]+$/.test(key))).toEqual([]);
  });

  it('in every language every text has the same placeholders as Italian', () => {
    const tokens = (message: string) => (message.match(/\$[A-Z_]+\$/g) ?? []).sort();
    const it = load('it') as Record<string, Message & { placeholders?: unknown }>;
    for (const locale of LOCALES) {
      const other = load(locale) as Record<string, Message & { placeholders?: unknown }>;
      for (const [key, value] of Object.entries(it)) {
        expect(tokens(other[key]!.message), `${locale}: ${key}`).toEqual(tokens(value.message));
        expect(other[key]!.placeholders, `${locale}: ${key}`).toEqual(value.placeholders);
      }
    }
  });

  it('the extension name and description are within the Chrome Web Store limits', () => {
    for (const locale of LOCALES) {
      const messages = load(locale) as Record<string, Message>;
      expect(messages.extName!.message.length, locale).toBeLessThanOrEqual(45);
      expect(messages.extDescription!.message.length, locale).toBeLessThanOrEqual(132);
    }
  });
});

/** All the source files of the interface and logic, with their content. */
function sources(): string[] {
  const roots = ['src', 'entrypoints'].map((dir) => new URL(`../${dir}/`, import.meta.url));
  const files: string[] = [];
  const walk = (url: URL) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, url));
      else if (/\.(ts|tsx|html)$/.test(entry.name)) files.push(readFileSync(new URL(entry.name, url), 'utf8'));
    }
  };
  roots.forEach(walk);
  files.push(readFileSync(new URL('../wxt.config.ts', import.meta.url), 'utf8'));
  return files;
}

const WARNING_CAUSES: ProposalWarning['cause'][] = [
  'unreachable',
  'invalid-key',
  'rate-limit',
  'timeout',
  'invalid-response',
  'invalid-request',
  'unavailable',
  'no-permission',
  'needs-download',
  'downloading',
  'not-supported',
];
const PROVENANCES: Provenance[] = ['list', 'existing', 'ai', 'domain', 'manual'];
const NANO_STATUSES: NanoAvailability[] = ['available', 'downloadable', 'downloading', 'unavailable'];

describe('keys used in the code', () => {
  const messages = load('it');
  // The keys written in the code all have one of these prefixes (see the files in public/_locales).
  const KEY_LITERAL = /['"`]((?:ext|action|popup|panel|options|onboarding|error|saveToList|userGroup)[A-Z][A-Za-z0-9_]*)['"`]|__MSG_(\w+)__/g;

  it('every key written in the code exists in the translations', () => {
    const used = new Set<string>();
    for (const source of sources()) {
      for (const match of source.matchAll(KEY_LITERAL)) used.add((match[1] ?? match[2])!);
    }

    expect(used.size).toBeGreaterThan(50);
    expect([...used].filter((key) => !(key in messages))).toEqual([]);
  });

  it('the keys composed at runtime exist (warnings, colors, provenances, Gemini Nano status, categories)', () => {
    const categoryKeys = [...readFileSync(new URL('../src/settings/categories.ts', import.meta.url), 'utf8').matchAll(/key: '(\w+)'/g)].map((m) => m[1]!);
    const dynamic = [
      ...WARNING_CAUSES.map(warningKey),
      ...GROUP_COLORS.map((c) => `color_${c}`),
      ...PROVENANCES.map((p) => `provenance_${p}`),
      ...NANO_STATUSES.map((s) => `nanoStatus_${s}`),
      ...categoryKeys.flatMap((k) => [`category_${k}_name`, `category_${k}_description`]),
    ];

    expect(categoryKeys).toHaveLength(10);
    expect(dynamic.filter((key) => !(key in messages))).toEqual([]);
  });

  it('every translation key is used: written in the code or composed at runtime', () => {
    const code = sources().join('\n');
    const categoryKeys = [...readFileSync(new URL('../src/settings/categories.ts', import.meta.url), 'utf8').matchAll(/key: '(\w+)'/g)].map((m) => m[1]!);
    const dynamic = new Set([
      ...WARNING_CAUSES.map(warningKey),
      ...GROUP_COLORS.map((c) => `color_${c}`),
      ...PROVENANCES.map((p) => `provenance_${p}`),
      ...NANO_STATUSES.map((s) => `nanoStatus_${s}`),
      ...categoryKeys.flatMap((k) => [`category_${k}_name`, `category_${k}_description`]),
    ]);
    // Written in quotes (even without the prefixes, e.g. 'aiLanguageName') or as __MSG_key__.
    const literal = (key: string) => new RegExp(`['"\`]${key}['"\`]|__MSG_${key}__`).test(code);

    expect(Object.keys(messages).filter((key) => !dynamic.has(key) && !literal(key))).toEqual([]);
  });

  it('Italian and English use the same placeholders', () => {
    const en = load('en') as Record<string, Message>;
    const placeholders = (m: Message) => [...m.message.matchAll(/\$(\w+)\$/g)].map((x) => x[1]!.toLowerCase()).sort();
    const mismatched = Object.entries(messages as Record<string, Message>).filter(
      ([key, m]) => JSON.stringify(placeholders(m)) !== JSON.stringify(placeholders(en[key]!)),
    );

    expect(mismatched.map(([key]) => key)).toEqual([]);
  });
});
