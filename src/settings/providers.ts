import { browser } from 'wxt/browser';

/** The two AI roles: Classifier (System One) and Generator (OpenAI-compatible). */
export type ProviderRole = 'classifier' | 'generator';

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
  /** Official page with documentation and, for open source providers, downloads/installation. */
  homepage: string;
}

/**
 * Presets per role. Adding a provider compatible with one of the two protocols means
 * adding an entry here: the pipeline and the adapters do not change.
 */
const PROVIDER_PRESETS = {
  classifier: {
    jev: { label: 'Jev', baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', homepage: 'https://docs.typesafe.ai' },
    kev: { label: 'Kev', baseUrl: 'http://127.0.0.1:8009', model: '', homepage: 'https://github.com/jaredpalmer/kev' },
    rizzo: {
      label: 'Rizzo Flow',
      baseUrl: 'http://127.0.0.1:8017',
      model: 'rizzo-latest',
      homepage: 'https://github.com/Rizzo-AI-Academy/rizzo-flow',
    },
  },
  generator: {
    openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', homepage: 'https://openrouter.ai/models' },
    ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', homepage: 'https://ollama.com/library' },
    lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '', homepage: 'https://lmstudio.ai/models' },
    unsloth: { label: 'Unsloth Studio', baseUrl: 'http://127.0.0.1:8888/v1', model: '', homepage: 'https://unsloth.ai/docs/basics/unsloth-studio' },
  },
} satisfies Record<ProviderRole, Record<string, ProviderPreset>>;

/**
 * "none" = no provider; "custom" = URL and model chosen by the user; for the Generator also
 * "nano" = Gemini Nano built into Chrome, with no URL or key.
 */
type ProviderPresetId = string;

/** Configuration of a provider in storage.sync. The API key is kept separately, in storage.local. */
export interface ProviderSettings {
  preset: ProviderPresetId;
  baseUrl: string;
  model: string;
}

export const NO_PROVIDER: ProviderSettings = { preset: 'none', baseUrl: '', model: '' };

/** Gemini Nano Generator: it is the default, so without configuration Nano is used if the browser has it. */
export const NANO_PRESET = 'nano';
export const NANO_PROVIDER: ProviderSettings = { preset: NANO_PRESET, baseUrl: '', model: '' };

/** True if the provider has no server to contact (none, or Gemini Nano): no URL or permission. */
export function isLocalOnly(settings: ProviderSettings): boolean {
  return settings.preset === 'none' || settings.preset === NANO_PRESET;
}

export function presetsOf(role: ProviderRole): Record<string, ProviderPreset> {
  return PROVIDER_PRESETS[role];
}

/** Official page of the preset, if the selection is not "none", Nano or custom. */
export function providerHomepage(role: ProviderRole, preset: string): string | null {
  return presetsOf(role)[preset]?.homepage ?? null;
}

export function isProviderSettings(role: ProviderRole, value: unknown): value is ProviderSettings {
  const v = value as Partial<ProviderSettings> | undefined;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.preset === 'string' &&
    (v.preset in presetsOf(role) || v.preset === 'custom' || v.preset === 'none' || (role === 'generator' && v.preset === NANO_PRESET)) &&
    typeof v.baseUrl === 'string' &&
    typeof v.model === 'string'
  );
}

/**
 * True if the user has chosen a usable provider. The Generator always requires the model;
 * for the Classifier the System One protocol makes it optional. Rizzo Flow, however, requires it
 * (422 without), so its preset already has `rizzo-latest`.
 */
export function isProviderConfigured(role: ProviderRole, settings: ProviderSettings): boolean {
  if (isLocalOnly(settings) || settings.baseUrl.trim() === '') return false;
  return role === 'classifier' || settings.model.trim() !== '';
}

/**
 * Provider name for the warnings: preset label and base URL, e.g. "Kev (http://127.0.0.1:8009)".
 * For a custom provider the URL is enough.
 */
export function providerLabel(role: ProviderRole, settings: ProviderSettings): string {
  const preset = presetsOf(role)[settings.preset];
  return preset ? `${preset.label} (${settings.baseUrl})` : settings.baseUrl;
}

/** Cleans up the URL (spaces and trailing "/") and the model before saving. */
export function normalizeProvider(settings: ProviderSettings): ProviderSettings {
  return { ...settings, baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''), model: settings.model.trim() };
}

/**
 * Optional host permission pattern for a base URL, e.g. "https://openrouter.ai/*".
 * Ports do not count in Chrome's patterns. Returns null if the URL is not http(s).
 */
export function originPattern(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

/**
 * The host permission to request when saving a provider: `undefined` if it has no server (none, Gemini
 * Nano), `null` if the base URL is not http(s). Synchronous, because it must be computed inside the click, before
 * `permissions.request`.
 */
export function providerOrigin(settings: ProviderSettings): string | null | undefined {
  return isLocalOnly(settings) ? undefined : originPattern(settings.baseUrl);
}

/** True if the host permission for the base URL has already been granted. */
export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  const origin = originPattern(baseUrl);
  if (!origin) return false;
  return browser.permissions.contains({ origins: [origin] });
}

const apiKeyName = (role: ProviderRole) => `${role}ApiKey`;

/** Provider API key: only in storage.local, never synced. */
export async function loadApiKey(role: ProviderRole): Promise<string> {
  const key = apiKeyName(role);
  const stored = await browser.storage.local.get<Record<string, string>>(key);
  return stored[key] ?? '';
}

export async function saveApiKey(role: ProviderRole, value: string): Promise<void> {
  if (value) await browser.storage.local.set({ [apiKeyName(role)]: value });
  else await browser.storage.local.remove(apiKeyName(role));
}
