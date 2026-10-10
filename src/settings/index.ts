import { browser } from 'wxt/browser';
import type { Category } from '../shared/types';
import { defaultCategories, normalizeCategories, validateCategories } from './categories';
import { isProviderConfigured, isProviderSettings, NANO_PROVIDER, NO_PROVIDER, normalizeProvider, originPattern, type ProviderSettings } from './providers';

export * from './categories';
export * from './providers';

/** Soglia di confidenza di default del Classificatore. */
export const DEFAULT_THRESHOLD = 0.7;

/** Regole sui siti: ID della categoria → siti "dominio[/percorso]" le cui tab vanno sempre lì. */
export type CategorySites = Record<string, string[]>;

/** Quota di un elemento di chrome.storage.sync: byte del nome della chiave più il valore in JSON. */
export const SYNC_ITEM_QUOTA = 8192;

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
  /**
   * Regole sui siti, salvate in una chiave a parte per non togliere spazio alle categorie: le tab di
   * questi siti vanno sempre nella categoria, prima dell'AI e del raggruppamento per dominio.
   */
  categorySites: CategorySites;
  /** Generatore scelto dall'utente: compatibile OpenAI, Gemini Nano o nessuno (senza la chiave API, che sta in storage.local). */
  generator: ProviderSettings;
  /** Classificatore System One scelto dall'utente (senza la chiave API). */
  classifier: ProviderSettings;
  /** Confidenza minima perché il Classificatore assegni una tab, tra 0 e 1. */
  threshold: number;
  /** "Leggi la descrizione delle pagine": vale solo se il permesso opzionale <all_urls> è concesso. */
  readDescriptions: boolean;
  /** Raggruppamento automatico: una tab che apre un sito delle regole va subito nel gruppo della sua categoria. */
  autoGroupSites: boolean;
}

const KEYS: (keyof Settings)[] = ['mode', 'minTabs', 'excludedDomains', 'categories', 'categorySites', 'generator', 'classifier', 'threshold', 'readDescriptions', 'autoGroupSites'];

export const DEFAULT_SETTINGS: Omit<Settings, 'categories'> = {
  mode: 'ai',
  minTabs: 2,
  excludedDomains: [],
  categorySites: {},
  generator: NANO_PROVIDER,
  classifier: NO_PROVIDER,
  threshold: DEFAULT_THRESHOLD,
  readDescriptions: false,
  autoGroupSites: true,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get<Partial<Settings>>(KEYS);
  return {
    mode: stored.mode === 'domain' ? 'domain' : 'ai',
    minTabs: isValidMinTabs(stored.minTabs) ? stored.minTabs : DEFAULT_SETTINGS.minTabs,
    excludedDomains: Array.isArray(stored.excludedDomains) ? stored.excludedDomains : DEFAULT_SETTINGS.excludedDomains,
    categories: validateCategories(stored.categories) === null ? stored.categories! : defaultCategories(),
    categorySites: validateCategorySites(stored.categorySites) === null ? stored.categorySites! : {},
    generator: isProviderSettings('generator', stored.generator) ? stored.generator : NANO_PROVIDER,
    classifier: isProviderSettings('classifier', stored.classifier) ? stored.classifier : NO_PROVIDER,
    threshold: isValidThreshold(stored.threshold) ? stored.threshold : DEFAULT_THRESHOLD,
    readDescriptions: stored.readDescriptions === true,
    autoGroupSites: stored.autoGroupSites !== false,
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
  if (patch.categorySites !== undefined) {
    const error = validateCategorySites(patch.categorySites);
    if (error) throw new SettingsError(error);
  }
  if (patch.categories !== undefined || patch.categorySites !== undefined) {
    // Senza le categorie che non esistono più e senza liste vuote.
    const current = await loadSettings();
    const ids = new Set((patch.categories ?? current.categories).map((c) => c.id));
    const sites = Object.entries(patch.categorySites ?? current.categorySites).filter(([id, list]) => ids.has(id) && list.length > 0);
    patch = { ...patch, categorySites: Object.fromEntries(sites) };
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

/**
 * Spegne la lettura delle descrizioni togliendo `<all_urls>`, senza togliere l'accesso ai provider.
 * Se l'host di un provider è stato concesso mentre `<all_urls>` era attivo, Chrome può non averlo
 * registrato a parte (la richiesta era già coperta): tolto `<all_urls>`, il provider resterebbe senza
 * accesso. Per questo gli host dei provider che non hanno più il permesso vengono richiesti subito,
 * ancora dentro il clic dell'utente sull'interruttore. Se Chrome li aveva registrati non si chiede nulla.
 * Restituisce gli host rimasti senza permesso (l'utente ha rifiutato).
 */
export async function removeDescriptionPermission(): Promise<string[]> {
  const { classifier, generator } = await loadSettings();
  const origins = [
    ...new Set(
      ([['classifier', classifier], ['generator', generator]] as const)
        .filter(([role, provider]) => isProviderConfigured(role, provider))
        .map(([, provider]) => originPattern(provider.baseUrl))
        .filter((origin): origin is string => origin !== null),
    ),
  ];
  await browser.permissions.remove({ origins: [ALL_URLS] });
  const missing: string[] = [];
  for (const origin of origins) if (!(await browser.permissions.contains({ origins: [origin] }))) missing.push(origin);
  if (missing.length === 0) return [];
  const granted = await browser.permissions.request({ origins: missing }).catch(() => false);
  return granted ? [] : missing;
}

/** "Ripristina default": torna alla lista predefinita nella lingua del browser, senza siti. */
export async function resetCategories(): Promise<Category[]> {
  await browser.storage.sync.remove(['categories', 'categorySites']);
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

/**
 * Riduce un sito scritto dall'utente a "dominio[/percorso]": il dominio come `normalizeDomain`, il
 * percorso in minuscolo, senza query, frammento né "/" finale. Restituisce null se il dominio non è valido.
 */
export function normalizeSite(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = normalizeDomain(url.hostname);
  if (!host) return null;
  return [host, ...url.pathname.toLowerCase().split('/').filter(Boolean)].join('/');
}

/**
 * Restituisce la chiave i18n del primo errore dei siti, oppure null se vanno bene: ogni sito già
 * normalizzato, nessun sito in due categorie, tutto dentro la quota di un elemento di storage.sync.
 */
export function validateCategorySites(value: unknown): 'optionsSitesInvalid' | 'optionsSitesTooMany' | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'optionsSitesInvalid';
  const seen = new Set<string>();
  for (const list of Object.values(value)) {
    if (!Array.isArray(list)) return 'optionsSitesInvalid';
    for (const site of list) {
      if (typeof site !== 'string' || normalizeSite(site) !== site || seen.has(site)) return 'optionsSitesInvalid';
      seen.add(site);
    }
  }
  const bytes = new TextEncoder().encode(`categorySites${JSON.stringify(value)}`).length;
  return bytes > SYNC_ITEM_QUOTA ? 'optionsSitesTooMany' : null;
}

/** Vero se l'host è uno dei domini esclusi o un loro sottodominio (google.com esclude mail.google.com). */
export function isExcludedHost(host: string, excludedDomains: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return excludedDomains.some((d) => h === d || h.endsWith(`.${d}`));
}
