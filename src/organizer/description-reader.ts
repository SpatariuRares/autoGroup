import { browser } from 'wxt/browser';
import { createSessionCache } from './session-cache';
import type { CandidateTab } from './tab-selection';

/** Maximum time to read the description of a tab. */
const DESCRIPTION_TIMEOUT_MS = 500;
const MAX_DESCRIPTION_LENGTH = 300;

/** Descriptions already read, by URL; null = page read, but without a description. */
const cache = createSessionCache<string | null>('descriptionCache', 1000);

/** Pages that Chrome does not let extensions read, or that have no meta description. */
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

/** Runs in the page: meta description, or og:description if the first is missing or empty. */
function readMetaDescription(): string | null {
  const content = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content.trim();
  return content('meta[name="description" i]') || content('meta[property="og:description" i]') || null;
}

/** The description, null if the page has none, undefined if it could not be read (timeout, access denied). */
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
 * Description reader: reads the meta description of the tabs in parallel, with a maximum time of
 * about 500 ms per tab. Tabs suspended by Memory Saver are never read (reading them would wake them up),
 * and so are the unreadable pages (chrome://, Web Store, PDF). The tabs of the excluded domains do not
 * arrive here, because the selection has already discarded them.
 *
 * The descriptions read stay in a cache per URL (including "no description"), so a new computation
 * reads only the new pages. A page that did not answer in time is not remembered and is retried
 * next time. A suspended tab already read before gets its description back without waking up.
 * Returns the description by Chrome tab ID; tabs without a description are missing.
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
