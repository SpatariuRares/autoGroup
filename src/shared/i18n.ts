import { browser } from 'wxt/browser';

/** Text translated by chrome.i18n. Returns the key if it is missing, so the error shows up right away. */
export function t(key: string, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(key as never, substitutions) || key;
}

/** Key of the warning message for a cause: chrome.i18n keys do not allow "-". */
export function warningKey(cause: string): string {
  return `warning_${cause.replace(/-/g, '_')}`;
}
