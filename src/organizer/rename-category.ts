import { categoryKey, loadSettings, saveSettings } from '../settings';

/**
 * Rinomina la categoria che si chiama `oldName` (senza distinguere maiuscole e minuscole), tenendo id,
 * descrizione, colore e siti. Se non c'è non fa nulla. Un nome vuoto, troppo lungo o già di un'altra
 * categoria viene rifiutato con un `SettingsError` e nulla cambia.
 */
export async function renameCategory(oldName: string, newName: string): Promise<void> {
  if (!categoryKey(oldName)) return;
  const { categories } = await loadSettings();
  const category = categories.find((c) => categoryKey(c.name) === categoryKey(oldName));
  if (!category) return;
  await saveSettings({ categories: categories.map((c) => (c === category ? { ...c, name: newName.trim() } : c)) });
}
