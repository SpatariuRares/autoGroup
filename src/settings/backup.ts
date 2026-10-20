import { BACKUP_KEYS, normalizeDomain, saveSettings, SettingsError, type Settings } from './index';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Il file di "Esporta": JSON leggibile, con il nome dell'app e la versione del formato. */
export function exportSettings(settings: Settings): string {
  // Solo le preferenze con `backup` nella tabella: provider e chiavi API non lasciano mai il browser.
  const picked = Object.fromEntries(BACKUP_KEYS.map((key) => [key, settings[key]]));
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
  for (const key of BACKUP_KEYS) if (key in source) (patch as Record<string, unknown>)[key] = source[key];
  // Scritti a mano nel file: si normalizzano e si scartano quelli non validi, invece di rifiutare il file.
  if (Array.isArray(patch.excludedDomains)) {
    const domains = patch.excludedDomains.map((d) => (typeof d === 'string' ? normalizeDomain(d) : null)).filter((d): d is string => d !== null);
    patch.excludedDomains = [...new Set(domains)].sort();
  }
  // Le categorie prima dei siti: saveSettings scarta i siti di categorie che non esistono.
  await saveSettings(patch);
  return patch;
}
