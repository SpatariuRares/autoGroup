import { browser } from 'wxt/browser';
import type { Category } from '../shared/types';
import { defaultCategories, normalizeCategories, validateCategories } from './categories';
import {
  isLocalOnly,
  isProviderConfigured,
  isProviderSettings,
  NANO_PRESET,
  NANO_PROVIDER,
  NO_PROVIDER,
  normalizeProvider,
  originPattern,
  saveApiKey,
  type ProviderRole,
  type ProviderSettings,
} from './providers';

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

/**
 * Modalità AI con Generatore e Classificatore tutti e due su "Nessuno": il pannello la chiama "Con
 * regole" e si applicano solo le regole sui siti, senza il ripiego per dominio.
 */
export function isRulesOnly(settings: Pick<Settings, 'mode' | 'generator' | 'classifier'>): boolean {
  return settings.mode === 'ai' && settings.generator.preset === 'none' && settings.classifier.preset === 'none';
}

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

/** Regole di una preferenza: valore di default, controllo, pulizia e se va nel backup. */
interface Field<T> {
  /** Il valore quando non c'è niente di salvato, o quello salvato non è valido. */
  fallback: () => T;
  /** Chiave i18n del motivo per cui il valore non va salvato, oppure null se va bene. */
  check: (value: unknown) => string | null;
  /** Pulizia prima del salvataggio, su un valore già controllato. */
  normalize?: (value: T) => T;
  /** Portata da un browser all'altro con "Esporta" e "Importa". Provider e chiavi API mai. */
  backup: boolean;
}

const unless = (ok: boolean, error = 'errorSaveSettings') => (ok ? null : error);
const isBoolean = (value: unknown) => unless(typeof value === 'boolean');

/**
 * Tutte le preferenze, una voce per campo di `Settings`: aggiungerne una significa aggiungere il
 * campo all'interfaccia e una voce qui. Lettura, salvataggio, default e backup si ricavano da questa tabella.
 */
const FIELDS: { [K in keyof Settings]: Field<Settings[K]> } = {
  mode: { fallback: () => 'ai', check: (v) => unless(v === 'ai' || v === 'domain'), backup: true },
  minTabs: { fallback: () => 2, check: (v) => unless(isValidMinTabs(v), 'optionsMinTabsInvalid'), backup: true },
  excludedDomains: {
    fallback: () => [],
    check: (v) => unless(Array.isArray(v) && v.every((d) => typeof d === 'string' && normalizeDomain(d) === d), 'optionsDomainInvalid'),
    backup: true,
  },
  categories: { fallback: defaultCategories, check: validateCategories, normalize: normalizeCategories, backup: true },
  categorySites: { fallback: () => ({}), check: validateCategorySites, backup: true },
  generator: {
    fallback: () => NANO_PROVIDER,
    check: (v) => unless(isProviderSettings('generator', v), 'optionsProviderInvalid'),
    normalize: normalizeProvider,
    backup: false,
  },
  classifier: {
    fallback: () => NO_PROVIDER,
    check: (v) => unless(isProviderSettings('classifier', v), 'optionsProviderInvalid'),
    normalize: normalizeProvider,
    backup: false,
  },
  threshold: { fallback: () => DEFAULT_THRESHOLD, check: (v) => unless(isValidThreshold(v), 'optionsThresholdInvalid'), backup: false },
  readDescriptions: { fallback: () => false, check: isBoolean, backup: false },
  autoGroupSites: { fallback: () => true, check: isBoolean, backup: true },
};

const KEYS = Object.keys(FIELDS) as (keyof Settings)[];

/** Le preferenze che vanno nel file di "Esporta". */
export const BACKUP_KEYS = KEYS.filter((key) => FIELDS[key].backup);

const field = (key: keyof Settings) => FIELDS[key] as Field<unknown>;

export const DEFAULT_SETTINGS = Object.fromEntries(
  KEYS.filter((key) => key !== 'categories').map((key) => [key, field(key).fallback()]),
) as Omit<Settings, 'categories'>;

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get<Record<string, unknown>>(KEYS);
  const settings = {} as Record<keyof Settings, unknown>;
  for (const key of KEYS) settings[key] = field(key).check(stored[key]) === null ? stored[key] : field(key).fallback();
  return settings as Settings;
}

/** Errore di validazione delle impostazioni, con la chiave i18n del messaggio da mostrare. */
export class SettingsError extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey);
  }
}

/** Salva solo i campi indicati. Se un valore non è valido la patch è rifiutata con un `SettingsError` e non cambia nulla. */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const checked: Partial<Record<keyof Settings, unknown>> = {};
  for (const key of KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    const error = field(key).check(value);
    if (error) throw new SettingsError(error);
    checked[key] = field(key).normalize?.(value) ?? value;
  }
  if (checked.categories !== undefined || checked.categorySites !== undefined) {
    // Senza le categorie che non esistono più e senza liste vuote.
    const current = await loadSettings();
    const ids = new Set(((checked.categories as Category[] | undefined) ?? current.categories).map((c) => c.id));
    const sites = Object.entries((checked.categorySites as CategorySites | undefined) ?? current.categorySites).filter(([id, list]) => ids.has(id) && list.length > 0);
    checked.categorySites = Object.fromEntries(sites);
  }
  await browser.storage.sync.set(checked);
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

/** Esito di "Salva" per un provider: spento, Gemini Nano, dati mancanti, pronto, oppure permesso rifiutato. */
export type ProviderSaveResult = 'off' | 'nano' | 'incomplete' | 'ready' | 'no-permission';

/**
 * "Salva" di un provider: salva le impostazioni e la chiave API (solo in storage.local), toglie il
 * permesso host dell'URL base di prima se nessuno dei due provider lo usa più, poi aspetta la risposta
 * dell'utente al permesso. `granted` è la promessa di `permissions.request`, che la pagina chiama dentro
 * il clic per l'origine di `providerOrigin(draft)` (o `false` se non serve).
 */
export async function saveProvider(role: ProviderRole, draft: ProviderSettings, apiKey: string, granted: Promise<boolean>): Promise<ProviderSaveResult> {
  const previous = (await loadSettings())[role];
  await saveSettings({ [role]: draft });
  await saveApiKey(role, apiKey.trim());
  await releaseUnusedPermission(previous.baseUrl);
  const ok = await granted;
  if (draft.preset === 'none') return 'off';
  if (draft.preset === NANO_PRESET) return 'nano';
  if (!isProviderConfigured(role, draft)) return 'incomplete';
  return ok ? 'ready' : 'no-permission';
}

/**
 * Toglie il permesso host di un URL base non più usato. Classificatore e Generatore possono
 * condividere un host (es. entrambi su 127.0.0.1): il permesso resta finché uno dei due lo usa.
 */
async function releaseUnusedPermission(previousBaseUrl: string) {
  const previous = originPattern(previousBaseUrl);
  if (!previous) return;
  const { classifier, generator } = await loadSettings();
  const inUse = [classifier, generator].some((p) => !isLocalOnly(p) && originPattern(p.baseUrl) === previous);
  if (!inUse) await browser.permissions.remove({ origins: [previous] }).catch(() => {});
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
