import { browser } from 'wxt/browser';

/** Testo tradotto da chrome.i18n. Restituisce la chiave se manca, così l'errore si vede subito. */
export function t(key: string, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(key as never, substitutions) || key;
}
