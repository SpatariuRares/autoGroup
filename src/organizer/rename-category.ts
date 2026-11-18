import { categoryKey, loadSettings, saveSettings } from '../settings';

/**
 * Renames the category called `oldName` (case-insensitive), keeping its id,
 * description, color and sites. If there is none, it does nothing. An empty or too long name, or one
 * already used by another category, is rejected with a `SettingsError` and nothing changes.
 */
export async function renameCategory(oldName: string, newName: string): Promise<void> {
  if (!categoryKey(oldName)) return;
  const { categories } = await loadSettings();
  const category = categories.find((c) => categoryKey(c.name) === categoryKey(oldName));
  if (!category) return;
  await saveSettings({ categories: categories.map((c) => (c === category ? { ...c, name: newName.trim() } : c)) });
}
