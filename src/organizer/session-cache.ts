import { browser } from 'wxt/browser';

/**
 * Cache chiave → valore in chrome.storage.session, con un numero massimo di voci: oltre il limite
 * escono le più vecchie. Come lo stato dell'Organizzatore, sopravvive al pannello e al riavvio del
 * service worker ma non alla chiusura di Chrome, quindi titoli e URL non restano sul disco.
 */
export interface SessionCache<T> {
  /** I valori trovati, per chiave; le chiavi assenti mancano. */
  getMany(keys: string[]): Promise<Map<string, T>>;
  /** Aggiunge o sostituisce le voci; una voce riscritta torna la più recente. */
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
      // Le chiavi di un oggetto (non numeriche) restano nell'ordine di inserimento: le prime sono le più vecchie.
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

/** Impronta breve (SHA-256 in esadecimale) di un valore qualsiasi, per chiavi di cache compatte. */
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
