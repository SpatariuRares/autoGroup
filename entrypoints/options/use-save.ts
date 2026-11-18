import { useRef, useState } from 'react';
import { loadSettings, saveSettings, SettingsError, type Settings } from '../../src/settings';
import { useExpiring } from '../../src/ui/use-expiring';

/** How long "Undo" stays visible after a deletion or a restore of the categories, or an import (paused while the mouse or focus is over it). */
const UNDO_MS = 8000;

/** An action that can be undone: the text of the snackbar and the values from before the settings it changed. */
export interface Undoable {
  text: string;
  before: Partial<Settings>;
}

/**
 * The only way the options page saves: every write goes through `save`, which shows the error,
 * rereads the settings and confirms with "Saved" or, if the action can be undone, with the "Undo"
 * snackbar. `setSettings` is the setter of `useSettings`.
 */
export function useSave(setSettings: (settings: Settings) => void) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [undoable, setUndoable, holdUndo] = useExpiring<Undoable>(UNDO_MS);

  /**
   * Runs `action` and confirms it. `undo` receives the result of the action (e.g. the imported keys) and
   * says what to offer with "Undo". An error goes to `onError` if there is one (the section shows it
   * near the field), otherwise to the banner at the top of the page. Returns false if the save failed.
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
    // Reread right away to show the save; useSettings rereads it anyway from storage.onChanged.
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

  /** Saves the given fields. */
  const update = (patch: Partial<Settings>) => save(() => saveSettings(patch));

  /** A save done by a section on its own (e.g. "Save" of a provider): rereads and confirms. */
  const confirm = () => save(async () => {});

  async function undo() {
    if (!undoable) return;
    setUndoable(null);
    // All the previous values together: deleting a category, the save also removed its sites.
    await update(undoable.before);
  }

  return {
    save,
    update,
    confirm,
    /** Offers "Undo" for a save already done (e.g. the deletion of a category). */
    offerUndo: setUndoable,
    undo,
    /** "Undo" takes the place of "Saved". */
    saved: saved && !undoable,
    error,
    undoable,
    holdUndo,
  };
}

export type Saving = ReturnType<typeof useSave>;

/** What each settings page receives. */
export interface PageProps {
  settings: Settings;
  saving: Saving;
}
