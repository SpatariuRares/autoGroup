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

describe('traduzioni', () => {
  it('italiano e inglese hanno le stesse chiavi, tutte in un formato accettato da Chrome', () => {
    const it = Object.keys(load('it')).sort();
    const en = Object.keys(load('en')).sort();

    expect(en).toEqual(it);
    // Chrome rifiuta di caricare l'estensione se una chiave contiene caratteri diversi da questi.
    expect(it.filter((key) => !/^[A-Za-z0-9_]+$/.test(key))).toEqual([]);
  });
});

/** Tutti i file sorgente dell'interfaccia e della logica, con il loro contenuto. */
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
];
const PROVENANCES: Provenance[] = ['list', 'existing', 'ai', 'domain'];
const NANO_STATUSES: NanoAvailability[] = ['available', 'downloadable', 'downloading', 'unavailable'];

describe('chiavi usate nel codice', () => {
  const messages = load('it');
  // Le chiavi scritte nel codice hanno tutte uno di questi prefissi (vedi i file in public/_locales).
  const KEY_LITERAL = /['"`]((?:ext|action|popup|panel|options|onboarding|error|saveToList|userGroup)[A-Z][A-Za-z0-9_]*)['"`]|__MSG_(\w+)__/g;

  it('ogni chiave scritta nel codice esiste nelle traduzioni', () => {
    const used = new Set<string>();
    for (const source of sources()) {
      for (const match of source.matchAll(KEY_LITERAL)) used.add((match[1] ?? match[2])!);
    }

    expect(used.size).toBeGreaterThan(50);
    expect([...used].filter((key) => !(key in messages))).toEqual([]);
  });

  it('esistono le chiavi composte a runtime (avvisi, colori, provenienze, stato di Gemini Nano, categorie)', () => {
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

  it('italiano e inglese usano gli stessi segnaposto', () => {
    const en = load('en') as Record<string, Message>;
    const placeholders = (m: Message) => [...m.message.matchAll(/\$(\w+)\$/g)].map((x) => x[1]!.toLowerCase()).sort();
    const mismatched = Object.entries(messages as Record<string, Message>).filter(
      ([key, m]) => JSON.stringify(placeholders(m)) !== JSON.stringify(placeholders(en[key]!)),
    );

    expect(mismatched.map(([key]) => key)).toEqual([]);
  });
});
