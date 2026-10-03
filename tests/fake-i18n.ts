import { readFileSync } from 'node:fs';
import { fakeBrowser } from 'wxt/testing/fake-browser';

type Messages = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

const load = (locale: string): Messages =>
  JSON.parse(readFileSync(new URL(`../public/_locales/${locale}/messages.json`, import.meta.url), 'utf8'));

/**
 * Sostituisce chrome.i18n con i veri file di traduzione, nella lingua indicata.
 * Il fake browser di WXT non implementa i18n.
 */
export function installFakeI18n(locale: 'it' | 'en' = 'it') {
  const messages = load(locale);
  Object.assign(fakeBrowser.i18n, {
    getUILanguage: () => locale,
    getMessage(key: string, substitutions?: string | string[]) {
      const entry = messages[key];
      if (!entry) return '';
      const subs = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
      return entry.message.replace(/\$(\w+)\$/g, (_, name: string) => {
        const content = entry.placeholders?.[name.toLowerCase()]?.content ?? '';
        return content.replace(/\$(\d)/g, (_m, n: string) => subs[Number(n) - 1] ?? '');
      });
    },
  });
}
