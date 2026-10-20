import { useRef, useState } from 'react';
import { loadSettings, saveSettings, SettingsError, type Settings } from '../../src/settings';
import { useExpiring } from '../../src/ui/use-expiring';

/** Per quanto resta visibile "Annulla" dopo un'eliminazione o un ripristino delle categorie, o un import (fermo con mouse o focus sopra). */
const UNDO_MS = 8000;

/** Un'azione che si può annullare: il testo della snackbar e i valori di prima delle impostazioni che ha cambiato. */
export interface Undoable {
  text: string;
  before: Partial<Settings>;
}

/**
 * L'unico modo in cui la pagina delle opzioni salva: ogni scrittura passa da `save`, che mostra
 * l'errore, rilegge le impostazioni e conferma con "Salvato" oppure, se l'azione si può annullare,
 * con la snackbar "Annulla". `setSettings` è il setter di `useSettings`.
 */
export function useSave(setSettings: (settings: Settings) => void) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [undoable, setUndoable, holdUndo] = useExpiring<Undoable>(UNDO_MS);

  /**
   * Esegue `action` e la conferma. `undo` riceve il risultato dell'azione (es. le chiavi importate) e
   * dice cosa offrire con "Annulla". Un errore va in `onError` se c'è (la sezione lo mostra vicino al
   * campo), altrimenti nel banner in cima alla pagina. Restituisce false se il salvataggio è fallito.
   */
  async function save<T>(
    action: () => Promise<T>,
    options: { undo?: (result: T) => Undoable; onError?: (messageKey: string) => void } = {},
  ): Promise<boolean> {
    let result: T;
    try {
      result = await action();
    } catch (err) {
      console.error('autoGroup:', err);
      const key = err instanceof SettingsError ? err.messageKey : 'errorSaveSettings';
      if (options.onError) options.onError(key);
      else setError(key);
      return false;
    }
    setError(null);
    // Riletta subito per mostrare il salvataggio; useSettings la rileggerà comunque da storage.onChanged.
    setSettings(await loadSettings());
    if (options.undo) {
      setUndoable(options.undo(result));
    } else {
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1500);
    }
    return true;
  }

  /** Salva i campi indicati. */
  const update = (patch: Partial<Settings>) => save(() => saveSettings(patch));

  /** Un salvataggio fatto da una sezione per conto suo (es. "Salva" di un provider): rilegge e conferma. */
  const confirm = () => save(async () => {});

  async function undo() {
    if (!undoable) return;
    setUndoable(null);
    // Tutti i valori di prima insieme: eliminando una categoria il salvataggio ha tolto anche i suoi siti.
    await update(undoable.before);
  }

  return {
    save,
    update,
    confirm,
    /** Offre "Annulla" per un salvataggio già fatto (es. l'eliminazione di una categoria). */
    offerUndo: setUndoable,
    undo,
    /** "Annulla" prende il posto di "Salvato". */
    saved: saved && !undoable,
    error,
    undoable,
    holdUndo,
  };
}

export type Saving = ReturnType<typeof useSave>;

/** Quello che riceve ogni pagina delle impostazioni. */
export interface PageProps {
  settings: Settings;
  saving: Saving;
}
