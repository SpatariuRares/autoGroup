import { browser } from 'wxt/browser';
import { GROUP_COLORS, type Category, type GroupColor } from '../shared/types';

/** Lunghezza massima della descrizione: la lista deve stare negli 8 KB per elemento di storage.sync. */
export const MAX_DESCRIPTION_LENGTH = 300;
export const MAX_NAME_LENGTH = 40;

/** Le 10 categorie predefinite: chiave dei testi in _locales e colore fisso. */
const DEFAULTS: { key: string; color: GroupColor }[] = [
  { key: 'work', color: 'blue' },
  { key: 'dev', color: 'grey' },
  { key: 'ai', color: 'purple' },
  { key: 'social', color: 'pink' },
  { key: 'news', color: 'red' },
  { key: 'video', color: 'orange' },
  { key: 'shopping', color: 'yellow' },
  { key: 'travel', color: 'cyan' },
  { key: 'finance', color: 'green' },
  { key: 'study', color: 'blue' },
];

/** Categorie predefinite nella lingua del browser (testi da chrome.i18n). */
export function defaultCategories(): Category[] {
  return DEFAULTS.map(({ key, color }) => ({
    id: `default-${key}`,
    name: browser.i18n.getMessage(`category_${key}_name` as never),
    description: browser.i18n.getMessage(`category_${key}_description` as never),
    color,
  }));
}

/** Nome confrontabile: senza spazi ai lati e senza distinguere maiuscole e minuscole. */
export function categoryKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export type CategoryError = 'categoryNameEmpty' | 'categoryNameDuplicate' | 'categoryNameTooLong' | 'categoryDescriptionTooLong' | 'categoryInvalid';

/** Restituisce la chiave i18n del primo errore della lista, oppure null se è valida. */
export function validateCategories(categories: unknown): CategoryError | null {
  if (!Array.isArray(categories)) return 'categoryInvalid';
  const seen = new Set<string>();
  for (const c of categories as Partial<Category>[]) {
    if (
      typeof c?.id !== 'string' ||
      typeof c.name !== 'string' ||
      typeof c.description !== 'string' ||
      !GROUP_COLORS.includes(c.color as GroupColor)
    ) {
      return 'categoryInvalid';
    }
    const key = categoryKey(c.name);
    if (!key) return 'categoryNameEmpty';
    if (c.name.trim().length > MAX_NAME_LENGTH) return 'categoryNameTooLong';
    if (c.description.length > MAX_DESCRIPTION_LENGTH) return 'categoryDescriptionTooLong';
    if (seen.has(key)) return 'categoryNameDuplicate';
    seen.add(key);
  }
  return null;
}

/** Pulisce i nomi (spazi ai lati) prima del salvataggio. */
export function normalizeCategories(categories: Category[]): Category[] {
  return categories.map((c) => ({ ...c, name: c.name.trim(), description: c.description.trim() }));
}

export function newCategoryId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
