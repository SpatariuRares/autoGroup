import { browser } from 'wxt/browser';
import { createSessionCache } from './session-cache';
import type { CandidateTab } from './tab-selection';

/** Tempo massimo per leggere la descrizione di una tab. */
const DESCRIPTION_TIMEOUT_MS = 500;
const MAX_DESCRIPTION_LENGTH = 300;

/** Descrizioni già lette, per URL; null = pagina letta, ma senza descrizione. */
const cache = createSessionCache<string | null>('descriptionCache', 1000);

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

/** La descrizione, null se la pagina non ne ha, undefined se non si è potuta leggere (tempo scaduto, accesso negato). */
async function readOne(tab: CandidateTab): Promise<string | null | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), DESCRIPTION_TIMEOUT_MS);
  });
  const read = browser.scripting
    .executeScript({ target: { tabId: tab.tabId }, func: readMetaDescription })
    .then((results) => {
      const value = results?.[0]?.result;
      return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION_LENGTH) || null : null;
    })
    .catch(() => undefined);
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
 *
 * Le descrizioni lette restano in una cache per URL (anche "nessuna descrizione"), così un nuovo
 * calcolo legge solo le pagine nuove. Una pagina che non ha risposto in tempo non viene ricordata e
 * si riprova la volta dopo. Una tab sospesa già letta prima ritrova la sua descrizione senza risvegliarsi.
 * Restituisce la descrizione per ID di tab di Chrome; le tab senza descrizione mancano.
 */
export async function readDescriptions(tabs: CandidateTab[]): Promise<Map<number, string>> {
  const cached = await cache.getMany(tabs.map((tab) => tab.url));
  const toRead = tabs.filter((tab) => !cached.has(tab.url) && !tab.discarded && isReadable(tab));
  const read = await Promise.all(toRead.map(async (tab) => [tab.url, await readOne(tab)] as const));
  const fresh = new Map(read.filter((r): r is readonly [string, string | null] => r[1] !== undefined));
  await cache.setMany(fresh);

  const descriptions = new Map<number, string>();
  for (const tab of tabs) {
    const description = cached.get(tab.url) ?? fresh.get(tab.url);
    if (description) descriptions.set(tab.tabId, description);
  }
  return descriptions;
}
