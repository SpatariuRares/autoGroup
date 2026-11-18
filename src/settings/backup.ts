import { BACKUP_KEYS, saveSettings, SettingsError, type Settings } from './index';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The "Export" file: readable JSON, with the app name and the format version. */
export function exportSettings(settings: Settings): string {
  // Only the preferences with `backup` in the table: providers and API keys never leave the browser.
  const picked = Object.fromEntries(BACKUP_KEYS.map((key) => [key, settings[key]]));
  return `${JSON.stringify({ app: 'autoGroup', version: 1, exportedAt: new Date().toISOString(), settings: picked }, null, 2)}\n`;
}

/**
 * "Import": saves the preferences from the file, with the same validation as the settings. Missing keys
 * stay as they are; the excluded domains are normalized and the invalid ones discarded. An invalid file
 * is rejected with a `SettingsError` and changes nothing. Returns the saved keys.
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
  try {
    await saveSettings(patch);
  } catch (err) {
    // A value without a message of its own (e.g. a switch that is not a boolean) makes the file invalid.
    if (err instanceof SettingsError && err.messageKey === 'errorSaveSettings') throw new SettingsError('optionsImportInvalid');
    throw err;
  }
  return patch;
}
