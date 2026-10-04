import { browser } from 'wxt/browser';

/** I due ruoli AI: Classificatore (System One) e Generatore (compatibile OpenAI). */
export type ProviderRole = 'classifier' | 'generator';

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
}

/**
 * Preset per ruolo. Aggiungere un provider compatibile con uno dei due protocolli significa
 * aggiungere una voce qui: pipeline e adattatori non cambiano.
 */
const PROVIDER_PRESETS = {
  classifier: {
    jev: { label: 'Jev', baseUrl: 'https://api.typesafe.ai', model: 'jev-latest' },
    kev: { label: 'Kev', baseUrl: 'http://127.0.0.1:8009', model: '' },
    rizzo: { label: 'Rizzo Flow', baseUrl: 'http://127.0.0.1:8017', model: 'rizzo-latest' },
  },
  generator: {
    openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
    ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
    lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '' },
    unsloth: { label: 'Unsloth Studio', baseUrl: 'http://127.0.0.1:8888/v1', model: '' },
  },
} satisfies Record<ProviderRole, Record<string, ProviderPreset>>;

/**
 * "none" = nessun provider; "custom" = URL e modello scelti dall'utente; per il Generatore anche
 * "nano" = Gemini Nano integrato in Chrome, senza URL né chiave.
 */
type ProviderPresetId = string;

/** Configurazione di un provider in storage.sync. La chiave API sta a parte, in storage.local. */
export interface ProviderSettings {
  preset: ProviderPresetId;
  baseUrl: string;
  model: string;
}

export const NO_PROVIDER: ProviderSettings = { preset: 'none', baseUrl: '', model: '' };

/** Generatore Gemini Nano: è il default, così senza configurazione si usa Nano se il browser lo ha. */
export const NANO_PRESET = 'nano';
export const NANO_PROVIDER: ProviderSettings = { preset: NANO_PRESET, baseUrl: '', model: '' };

/** Vero se il provider non ha un server da contattare (nessuno, oppure Gemini Nano): niente URL né permesso. */
export function isLocalOnly(settings: ProviderSettings): boolean {
  return settings.preset === 'none' || settings.preset === NANO_PRESET;
}

export function presetsOf(role: ProviderRole): Record<string, ProviderPreset> {
  return PROVIDER_PRESETS[role];
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
 * Vero se l'utente ha scelto un provider utilizzabile. Il Generatore richiede sempre il modello;
 * per il Classificatore il protocollo System One lo rende facoltativo. Rizzo Flow però lo richiede
 * (422 senza), quindi il suo preset ha già `rizzo-latest`.
 */
export function isProviderConfigured(role: ProviderRole, settings: ProviderSettings): boolean {
  if (isLocalOnly(settings) || settings.baseUrl.trim() === '') return false;
  return role === 'classifier' || settings.model.trim() !== '';
}

/**
 * Nome del provider per gli avvisi: etichetta del preset e URL base, es. "Kev (http://127.0.0.1:8009)".
 * Per un provider personalizzato basta l'URL.
 */
export function providerLabel(role: ProviderRole, settings: ProviderSettings): string {
  const preset = presetsOf(role)[settings.preset];
  return preset ? `${preset.label} (${settings.baseUrl})` : settings.baseUrl;
}

/** Pulisce URL (spazi e "/" finale) e modello prima del salvataggio. */
export function normalizeProvider(settings: ProviderSettings): ProviderSettings {
  return { ...settings, baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''), model: settings.model.trim() };
}

/**
 * Pattern del permesso host opzionale per un URL base, es. "https://openrouter.ai/*".
 * Le porte non contano nei pattern di Chrome. Restituisce null se l'URL non è http(s).
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

/** Vero se il permesso host per l'URL base è già stato concesso. */
export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  const origin = originPattern(baseUrl);
  if (!origin) return false;
  return browser.permissions.contains({ origins: [origin] });
}

const apiKeyName = (role: ProviderRole) => `${role}ApiKey`;

/** Chiave API del provider: solo in storage.local, mai sincronizzata. */
export async function loadApiKey(role: ProviderRole): Promise<string> {
  const key = apiKeyName(role);
  const stored = await browser.storage.local.get<Record<string, string>>(key);
  return stored[key] ?? '';
}

export async function saveApiKey(role: ProviderRole, value: string): Promise<void> {
  if (value) await browser.storage.local.set({ [apiKeyName(role)]: value });
  else await browser.storage.local.remove(apiKeyName(role));
}
