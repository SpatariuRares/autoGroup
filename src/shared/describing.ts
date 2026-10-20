import { browser } from 'wxt/browser';

/**
 * Le categorie di cui l'AI sta scrivendo la descrizione dopo "Aggiungi alle categorie" (ID), in
 * chrome.storage.session: la pagina delle impostazioni le segue dal vivo e mostra che stanno arrivando.
 */
const DESCRIBING_KEY = 'describingCategories';

export async function loadDescribing(): Promise<string[]> {
  const stored = await browser.storage.session.get(DESCRIBING_KEY);
  return (stored[DESCRIBING_KEY] as string[] | undefined) ?? [];
}

/** Segna (o toglie) una categoria come "in descrizione". */
export async function setDescribing(categoryId: string, describing: boolean): Promise<void> {
  const ids = (await loadDescribing()).filter((id) => id !== categoryId);
  await browser.storage.session.set({ [DESCRIBING_KEY]: describing ? [...ids, categoryId] : ids });
}

/** Chiama `listener` con l'elenco a ogni cambio; restituisce la funzione per smettere. */
export function onDescribingChange(listener: (ids: string[]) => void): () => void {
  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'session' && DESCRIBING_KEY in changes) listener((changes[DESCRIBING_KEY]!.newValue as string[] | undefined) ?? []);
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}
