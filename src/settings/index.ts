import { browser } from 'wxt/browser';

/** Preferenze sincronizzate tra i Chrome dell'utente (chrome.storage.sync). */
export interface Settings {
  /** Numero minimo di tab per creare un gruppo nuovo. Intero ≥ 1. */
  minTabs: number;
  /** Domini le cui tab non vengono mai proposte né inviate all'AI. Valgono anche per i sottodomini. */
  excludedDomains: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  minTabs: 2,
  excludedDomains: [],
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get<Partial<Settings>>(Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]);
  return {
    minTabs: isValidMinTabs(stored.minTabs) ? stored.minTabs : DEFAULT_SETTINGS.minTabs,
    excludedDomains: Array.isArray(stored.excludedDomains) ? stored.excludedDomains : DEFAULT_SETTINGS.excludedDomains,
  };
}

/** Salva solo i campi indicati. I valori non validi vengono rifiutati con un errore. */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  if (patch.minTabs !== undefined && !isValidMinTabs(patch.minTabs)) {
    throw new Error(`minTabs non valido: ${patch.minTabs}`);
  }
  await browser.storage.sync.set(patch);
}

export function isValidMinTabs(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Riduce quello che l'utente scrive a un dominio: minuscole, senza schema, percorso, porta né "www.".
 * Restituisce null se il risultato non sembra un dominio.
 */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) || host.startsWith('-')) return null;
  return host;
}

/** Vero se l'host è uno dei domini esclusi o un loro sottodominio (google.com esclude mail.google.com). */
export function isExcludedHost(host: string, excludedDomains: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return excludedDomains.some((d) => h === d || h.endsWith(`.${d}`));
}
