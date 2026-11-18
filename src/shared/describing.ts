import { browser } from 'wxt/browser';

/**
 * The categories whose description the AI is writing after "Add to categories" (IDs), in
 * chrome.storage.session: the settings page follows them live and shows that they are arriving.
 */
const DESCRIBING_KEY = 'describingCategories';

export async function loadDescribing(): Promise<string[]> {
  const stored = await browser.storage.session.get(DESCRIBING_KEY);
  return (stored[DESCRIBING_KEY] as string[] | undefined) ?? [];
}

/** Marks (or unmarks) a category as "being described". */
export async function setDescribing(categoryId: string, describing: boolean): Promise<void> {
  const ids = (await loadDescribing()).filter((id) => id !== categoryId);
  await browser.storage.session.set({ [DESCRIBING_KEY]: describing ? [...ids, categoryId] : ids });
}

/** Calls `listener` with the list on every change; returns the function to stop listening. */
export function onDescribingChange(listener: (ids: string[]) => void): () => void {
  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'session' && DESCRIBING_KEY in changes) listener((changes[DESCRIBING_KEY]!.newValue as string[] | undefined) ?? []);
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}
