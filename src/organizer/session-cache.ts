import { browser } from 'wxt/browser';

/**
 * Key → value cache in chrome.storage.session, with a maximum number of entries: beyond the limit
 * the oldest ones are evicted. Like the Organizer's state, it survives the side panel and the service
 * worker restarting but not Chrome being closed, so titles and URLs do not stay on disk.
 */
export interface SessionCache<T> {
  /** The values found, by key; the keys not found are absent. */
  getMany(keys: string[]): Promise<Map<string, T>>;
  /** Adds or replaces the entries; a rewritten entry becomes the most recent. */
  setMany(entries: Map<string, T>): Promise<void>;
}

export function createSessionCache<T>(storageKey: string, maxEntries: number): SessionCache<T> {
  async function read(): Promise<Record<string, T>> {
    const stored = await browser.storage.session.get(storageKey);
    const value = stored[storageKey];
    return typeof value === 'object' && value !== null ? (value as Record<string, T>) : {};
  }

  return {
    async getMany(keys) {
      if (keys.length === 0) return new Map();
      const all = await read();
      return new Map(keys.filter((k) => Object.hasOwn(all, k)).map((k) => [k, all[k]!]));
    },

    async setMany(entries) {
      if (entries.size === 0) return;
      const all = await read();
      // The keys of an object (non-numeric ones) stay in insertion order: the first ones are the oldest.
      for (const [key, value] of entries) {
        delete all[key];
        all[key] = value;
      }
      const keys = Object.keys(all);
      for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) delete all[key];
      await browser.storage.session.set({ [storageKey]: all });
    },
  };
}

/** Short digest (SHA-256 in hexadecimal) of any value, for compact cache keys. */
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
