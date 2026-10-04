import { browser } from 'wxt/browser';
import type { CandidateTab } from './tab-selection';

/** Tempo massimo per leggere la descrizione di una tab. */
const DESCRIPTION_TIMEOUT_MS = 500;
const MAX_DESCRIPTION_LENGTH = 300;

/** Pagine che Chrome non lascia leggere alle estensioni, o che non hanno una meta description. */
function isReadable(tab: CandidateTab): boolean {
  let url: URL;
  try {
    url = new URL(tab.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.hostname === 'chromewebstore.google.com') return false;
  if (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) return false;
  if (url.pathname.toLowerCase().endsWith('.pdf')) return false;
  return true;
}

/** Eseguita nella pagina: meta description, oppure og:description se la prima manca o è vuota. */
function readMetaDescription(): string | null {
  const content = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content.trim();
  return content('meta[name="description" i]') || content('meta[property="og:description" i]') || null;
}

async function readOne(tab: CandidateTab): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), DESCRIPTION_TIMEOUT_MS);
  });
  const read = browser.scripting
    .executeScript({ target: { tabId: tab.tabId }, func: readMetaDescription })
    .then((results) => {
      const value = results?.[0]?.result;
      return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION_LENGTH) || null : null;
    })
    .catch(() => null);
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lettore descrizioni: legge in parallelo la meta description delle tab, con un tempo massimo di
 * circa 500 ms per tab. Le tab sospese da Risparmio memoria non vengono mai lette (leggerle le
 * risveglierebbe), e così le pagine non leggibili (chrome://, Web Store, PDF). Le tab dei domini
 * esclusi non arrivano qui, perché sono già state scartate dalla selezione.
 * Restituisce la descrizione per ID di tab di Chrome; le tab senza descrizione mancano.
 */
export async function readDescriptions(tabs: CandidateTab[]): Promise<Map<number, string>> {
  const readable = tabs.filter((tab) => !tab.discarded && isReadable(tab));
  const results = await Promise.all(readable.map(async (tab) => [tab.tabId, await readOne(tab)] as const));
  return new Map(results.filter((r): r is readonly [number, string] => r[1] !== null));
}
