import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
