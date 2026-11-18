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

/** Default confidence threshold of the Classifier. */
export const DEFAULT_THRESHOLD = 0.7;

/** Site rules: category ID → sites "domain[/path]" whose tabs always go there. */
export type CategorySites = Record<string, string[]>;

/** Quota of a chrome.storage.sync item: bytes of the key name plus the value in JSON. */
export const SYNC_ITEM_QUOTA = 8192;

/**
 * How to group: "domain" = always by domain, with no AI at all; "ai" = Classifier and
 * Generator configured, with the domain as the last fallback.
 */
export type GroupingMode = 'ai' | 'domain';

/**
 * AI mode with Generator and Classifier both set to "None": the panel calls it "With rules"
 * and only the site rules apply, without the domain fallback.
 */
export function isRulesOnly(settings: Pick<Settings, 'mode' | 'generator' | 'classifier'>): boolean {
  return settings.mode === 'ai' && settings.generator.preset === 'none' && settings.classifier.preset === 'none';
}

/** Preferences synced across the user's Chrome browsers (chrome.storage.sync). */
export interface Settings {
  mode: GroupingMode;
  /** Minimum number of tabs to create a new group. Integer ≥ 1. */
  minTabs: number;
  /** Domains whose tabs are never proposed nor sent to the AI. They also apply to subdomains. */
  excludedDomains: string[];
  /**
   * Fixed list of categories, in the order chosen by the user. Until the user edits it, it is not
   * saved and the default list in the browser's language applies.
   */
  categories: Category[];
  /**
   * Site rules, saved under a separate key so as not to take up space from the categories: the tabs of
   * these sites always go to the category, before the AI and the grouping by domain.
   */
  categorySites: CategorySites;
  /** Generator chosen by the user: OpenAI-compatible, Gemini Nano or none (without the API key, which lives in storage.local). */
  generator: ProviderSettings;
  /** System One Classifier chosen by the user (without the API key). */
  classifier: ProviderSettings;
  /** Minimum confidence for the Classifier to assign a tab, between 0 and 1. */
  threshold: number;
  /** "Read page descriptions": only applies if the optional <all_urls> permission is granted. */
  readDescriptions: boolean;
  /** Automatic grouping: a tab that opens a rule site goes straight into the group of its category. */
  autoGroupSites: boolean;
}

/** Regole di una preferenza: valore di default, controllo, pulizia e se va nel backup. */
interface Field<T> {
  /** The value when nothing is saved, or the saved one is not valid. */
  fallback: () => T;
  /** i18n key of the reason why the value must not be saved, or null if it is fine. */
  check: (value: unknown) => string | null;
  /** Cleanup of an already checked value, before saving and after reading. */
  normalize?: (value: T) => T;
  /** Carried from one browser to another with "Export" and "Import". Providers and API keys never. */
  backup: boolean;
}

/** The error key if the check does not pass, otherwise null. */
const errorUnless = (ok: boolean, error = 'errorSaveSettings') => (ok ? null : error);
const isBoolean = (value: unknown) => errorUnless(typeof value === 'boolean');

/** Normalized domains, without duplicates and in order; the invalid ones are discarded. */
function normalizeDomains(list: unknown[]): string[] {
  const domains = list.map((d) => (typeof d === 'string' ? normalizeDomain(d) : null)).filter((d): d is string => d !== null);
  return [...new Set(domains)].sort();
}

/**
 * All the preferences, one entry per field of `Settings`: adding one means adding the
 * field to the interface and an entry here. Reading, saving, defaults and backup are derived from this table.
 */
const FIELDS: { [K in keyof Settings]: Field<Settings[K]> } = {
  mode: { fallback: () => 'ai', check: (v) => errorUnless(v === 'ai' || v === 'domain'), backup: true },
  minTabs: { fallback: () => 2, check: (v) => errorUnless(isValidMinTabs(v), 'optionsMinTabsInvalid'), backup: true },
  // A broken domain discards itself: emptying the list would send the AI the tabs of the excluded sites.
  excludedDomains: { fallback: () => [], check: (v) => errorUnless(Array.isArray(v)), normalize: normalizeDomains, backup: true },
  categories: { fallback: defaultCategories, check: validateCategories, normalize: normalizeCategories, backup: true },
  categorySites: { fallback: () => ({}), check: validateCategorySites, backup: true },
  generator: {
    fallback: () => NANO_PROVIDER,
    check: (v) => errorUnless(isProviderSettings('generator', v), 'optionsProviderInvalid'),
    normalize: normalizeProvider,
    backup: false,
  },
  classifier: {
    fallback: () => NO_PROVIDER,
    check: (v) => errorUnless(isProviderSettings('classifier', v), 'optionsProviderInvalid'),
    normalize: normalizeProvider,
    backup: false,
  },
  threshold: { fallback: () => DEFAULT_THRESHOLD, check: (v) => errorUnless(isValidThreshold(v), 'optionsThresholdInvalid'), backup: false },
  readDescriptions: { fallback: () => false, check: isBoolean, backup: false },
  autoGroupSites: { fallback: () => true, check: isBoolean, backup: true },
};

const KEYS = Object.keys(FIELDS) as (keyof Settings)[];

/** The preferences that go into the "Export" file. */
export const BACKUP_KEYS = KEYS.filter((key) => FIELDS[key].backup);

const field = (key: keyof Settings) => FIELDS[key] as Field<unknown>;

export const DEFAULT_SETTINGS = Object.fromEntries(
  KEYS.filter((key) => key !== 'categories').map((key) => [key, field(key).fallback()]),
) as Omit<Settings, 'categories'>;

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get<Record<string, unknown>>(KEYS);
  const settings = {} as Record<keyof Settings, unknown>;
  for (const key of KEYS) {
    const { check, normalize, fallback } = field(key);
    settings[key] = check(stored[key]) === null ? (normalize?.(stored[key]) ?? stored[key]) : fallback();
  }
  return settings as Settings;
}

/** Settings validation error, with the i18n key of the message to show. */
export class SettingsError extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey);
  }
}

/** Saves only the given fields. If a value is not valid, the patch is rejected with a `SettingsError` and changes nothing. */
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
    // Without the categories that no longer exist and without empty lists.
    const current = await loadSettings();
    const ids = new Set(((checked.categories as Category[] | undefined) ?? current.categories).map((c) => c.id));
    const sites = Object.entries((checked.categorySites as CategorySites | undefined) ?? current.categorySites).filter(([id, list]) => ids.has(id) && list.length > 0);
    checked.categorySites = Object.fromEntries(sites);
  }
  await browser.storage.sync.set(checked);
}

/** Optional permission to read the description of pages. */
export const ALL_URLS = '<all_urls>';

export async function hasDescriptionPermission(): Promise<boolean> {
  return browser.permissions.contains({ origins: [ALL_URLS] });
}

/**
 * Turns off reading descriptions by removing `<all_urls>`, without removing access to the providers.
 * If a provider's host was granted while `<all_urls>` was active, Chrome may not have recorded it
 * separately (the request was already covered): with `<all_urls>` removed, the provider would be left without
 * access. For this reason the hosts of the providers that no longer have the permission are requested right away,
 * still inside the user's click on the toggle. If Chrome had recorded them, nothing is asked.
 * Returns the hosts left without permission (the user refused).
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

/** Outcome of "Save" for a provider: off, Gemini Nano, missing data, ready, or permission refused. */
export type ProviderSaveResult = 'off' | 'nano' | 'incomplete' | 'ready' | 'no-permission';

/**
 * "Save" of a provider: saves the settings and the API key (only in storage.local), removes the
 * host permission of the previous base URL if neither provider uses it anymore, then waits for the
 * user's answer to the permission. `granted` is the promise of `permissions.request`, which the page calls inside
 * the click for the origin of `providerOrigin(draft)` (or `false` if it is not needed).
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
 * Removes the host permission of a base URL no longer in use. Classifier and Generator can
 * share a host (e.g. both on 127.0.0.1): the permission stays as long as one of the two uses it.
 */
async function releaseUnusedPermission(previousBaseUrl: string) {
  const previous = originPattern(previousBaseUrl);
  if (!previous) return;
  const { classifier, generator } = await loadSettings();
  const inUse = [classifier, generator].some((p) => !isLocalOnly(p) && originPattern(p.baseUrl) === previous);
  if (!inUse) await browser.permissions.remove({ origins: [previous] }).catch(() => {});
}

/** "Restore defaults": goes back to the default list in the browser's language, without sites. */
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
 * Reduces what the user types to a domain: lowercase, without scheme, path, port or "www.".
 * Returns null if the result does not look like a domain.
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
 * Reduces a site written by the user to "domain[/path]": the domain as `normalizeDomain`, the
 * path in lowercase, without query, fragment or trailing "/". Returns null if the domain is not valid.
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
 * Returns the i18n key of the first site error, or null if they are fine: every site already
 * normalized, no site in two categories, everything within the quota of a storage.sync item.
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

/** True if the host is one of the excluded domains or a subdomain of one (google.com excludes mail.google.com). */
export function isExcludedHost(host: string, excludedDomains: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return excludedDomains.some((d) => h === d || h.endsWith(`.${d}`));
}
