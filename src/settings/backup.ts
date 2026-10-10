import { normalizeDomain, saveSettings, SettingsError, type Settings } from './index';

/** Le preferenze che si portano da un browser all'altro. Provider e chiavi API no: le chiavi non lasciano mai storage.local. */
const KEYS = ['mode', 'minTabs', 'excludedDomains', 'categories', 'categorySites', 'autoGroupSites'] as const satisfies (keyof Settings)[];

type Backup = Pick<Settings, (typeof KEYS)[number]>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Il file di "Esporta": JSON leggibile, con il nome dell'app e la versione del formato. */
export function exportSettings(settings: Settings): string {
  const picked = Object.fromEntries(KEYS.map((key) => [key, settings[key]])) as Backup;
  return `${JSON.stringify({ app: 'autoGroup', version: 1, exportedAt: new Date().toISOString(), settings: picked }, null, 2)}\n`;
}

/**
 * "Importa": salva le preferenze del file, con la stessa validazione delle impostazioni. Le chiavi
 * assenti restano come sono; i domini esclusi sono normalizzati e quelli non validi scartati. Un file
 * non valido è rifiutato con un `SettingsError` e non cambia nulla. Restituisce le chiavi salvate.
 */
export async function importSettings(text: string): Promise<Partial<Settings>> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SettingsError('optionsImportInvalid');
  }
  if (!isRecord(data) || data.app !== 'autoGroup' || !isRecord(data.settings)) throw new SettingsError('optionsImportInvalid');
  const source = data.settings;

  const patch: Partial<Settings> = {};
  for (const key of KEYS) if (key in source) (patch as Record<string, unknown>)[key] = source[key];
  if (patch.excludedDomains !== undefined) {
    if (!Array.isArray(patch.excludedDomains)) throw new SettingsError('optionsImportInvalid');
    const domains = patch.excludedDomains.map((d) => (typeof d === 'string' ? normalizeDomain(d) : null)).filter((d): d is string => d !== null);
    patch.excludedDomains = [...new Set(domains)].sort();
  }
  if (patch.autoGroupSites !== undefined && typeof patch.autoGroupSites !== 'boolean') throw new SettingsError('optionsImportInvalid');
  // Le categorie prima dei siti: saveSettings scarta i siti di categorie che non esistono.
  await saveSettings(patch);
  return patch;
}
