import { browser } from 'wxt/browser';
import type { Category } from '../shared/types';
import { defaultCategories, normalizeCategories, validateCategories } from './categories';
import { isProviderSettings, NANO_PROVIDER, NO_PROVIDER, normalizeProvider, type ProviderSettings } from './providers';

export * from './categories';
export * from './providers';

/** Soglia di confidenza di default del Classificatore. */
export const DEFAULT_THRESHOLD = 0.7;

/**
 * Come raggruppare: "domain" = sempre per dominio, senza nessuna AI; "ai" = Classificatore e
 * Generatore configurati, con il dominio come ultimo ripiego.
 */
export type GroupingMode = 'ai' | 'domain';

/** Preferenze sincronizzate tra i Chrome dell'utente (chrome.storage.sync). */
export interface Settings {
  mode: GroupingMode;
  /** Numero minimo di tab per creare un gruppo nuovo. Intero ≥ 1. */
  minTabs: number;
  /** Domini le cui tab non vengono mai proposte né inviate all'AI. Valgono anche per i sottodomini. */
  excludedDomains: string[];
  /**
   * Lista fissa delle categorie, nell'ordine scelto dall'utente. Finché l'utente non la modifica
   * non è salvata e vale la lista predefinita nella lingua del browser.
   */
  categories: Category[];
  /** Generatore scelto dall'utente: compatibile OpenAI, Gemini Nano o nessuno (senza la chiave API, che sta in storage.local). */
  generator: ProviderSettings;
  /** Classificatore System One scelto dall'utente (senza la chiave API). */
  classifier: ProviderSettings;
  /** Confidenza minima perché il Classificatore assegni una tab, tra 0 e 1. */
  threshold: number;
  /** "Leggi la descrizione delle pagine": vale solo se il permesso opzionale <all_urls> è concesso. */
  readDescriptions: boolean;
}

const KEYS: (keyof Settings)[] = ['mode', 'minTabs', 'excludedDomains', 'categories', 'generator', 'classifier', 'threshold', 'readDescriptions'];

export const DEFAULT_SETTINGS: Omit<Settings, 'categories'> = {
  mode: 'ai',
  minTabs: 2,
  excludedDomains: [],
  generator: NANO_PROVIDER,
  classifier: NO_PROVIDER,
  threshold: DEFAULT_THRESHOLD,
  readDescriptions: false,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get<Partial<Settings>>(KEYS);
  return {
    mode: stored.mode === 'domain' ? 'domain' : 'ai',
    minTabs: isValidMinTabs(stored.minTabs) ? stored.minTabs : DEFAULT_SETTINGS.minTabs,
    excludedDomains: Array.isArray(stored.excludedDomains) ? stored.excludedDomains : DEFAULT_SETTINGS.excludedDomains,
    categories: validateCategories(stored.categories) === null ? stored.categories! : defaultCategories(),
    generator: isProviderSettings('generator', stored.generator) ? stored.generator : NANO_PROVIDER,
    classifier: isProviderSettings('classifier', stored.classifier) ? stored.classifier : NO_PROVIDER,
    threshold: isValidThreshold(stored.threshold) ? stored.threshold : DEFAULT_THRESHOLD,
    readDescriptions: stored.readDescriptions === true,
  };
}

/** Errore di validazione delle impostazioni, con la chiave i18n del messaggio da mostrare. */
export class SettingsError extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey);
  }
}

/** Salva solo i campi indicati. I valori non validi vengono rifiutati con un `SettingsError`. */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  if (patch.mode !== undefined && patch.mode !== 'ai' && patch.mode !== 'domain') {
    throw new SettingsError('optionsProviderInvalid');
  }
  if (patch.minTabs !== undefined && !isValidMinTabs(patch.minTabs)) {
    throw new SettingsError('optionsMinTabsInvalid');
  }
  if (patch.categories !== undefined) {
    const error = validateCategories(patch.categories);
    if (error) throw new SettingsError(error);
    patch = { ...patch, categories: normalizeCategories(patch.categories) };
  }
  if (patch.generator !== undefined) {
    if (!isProviderSettings('generator', patch.generator)) throw new SettingsError('optionsProviderInvalid');
    patch = { ...patch, generator: normalizeProvider(patch.generator) };
  }
  if (patch.classifier !== undefined) {
    if (!isProviderSettings('classifier', patch.classifier)) throw new SettingsError('optionsProviderInvalid');
    patch = { ...patch, classifier: normalizeProvider(patch.classifier) };
  }
  if (patch.threshold !== undefined && !isValidThreshold(patch.threshold)) {
    throw new SettingsError('optionsThresholdInvalid');
  }
  await browser.storage.sync.set(patch);
}

/** Permesso opzionale per leggere la descrizione delle pagine. */
export const ALL_URLS = '<all_urls>';

export async function hasDescriptionPermission(): Promise<boolean> {
  return browser.permissions.contains({ origins: [ALL_URLS] });
}

/** "Ripristina default": torna alla lista predefinita nella lingua del browser. */
export async function resetCategories(): Promise<Category[]> {
  await browser.storage.sync.remove('categories');
  return defaultCategories();
}

export function isValidThreshold(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
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
