import { categoryKey, loadSettings, MAX_NAME_LENGTH, newCategoryId, saveSettings, SettingsError } from '../settings';
import type { OrganizerState, Proposal } from '../shared/types';
import { describeCategory } from './pipeline';
import { collectInputs, keepCurrent } from './proposal-builder';

interface SaveResult {
  proposal: Proposal;
  notice: NonNullable<OrganizerState['notice']>;
}

/**
 * "Salva nella lista": aggiunge alla lista delle categorie un gruppo inventato dall'AI, con il nome
 * e il colore che ha ora nella proposta (anche se l'utente lo ha cambiato) e una descrizione chiesta
 * al Generatore. Se il Generatore non risponde la categoria viene salvata con la descrizione vuota.
 * Una categoria con lo stesso nome (senza distinguere maiuscole e minuscole) non viene duplicata.
 *
 * Dopo il salvataggio il gruppo diventa "lista" e, se la proposta era attuale, resta attuale con la
 * nuova lista, così (con le modifiche dell'utente) resta valida riaprendo il pannello. L'attualità
 * si controlla dopo la descrizione: se le tab cambiano mentre il Generatore risponde, la proposta
 * resta scaduta.
 */
export async function saveGroupToList(proposal: Proposal, groupId: string, signal?: AbortSignal): Promise<SaveResult | null> {
  const group = proposal.groups.find((g) => g.id === groupId);
  if (!group || group.provenance !== 'ai') return null;
  const name = group.name.trim();

  const { categories } = await loadSettings();
  if (categories.some((c) => categoryKey(c.name) === categoryKey(name))) {
    return { proposal, notice: { key: 'saveToListDuplicate', arg: name } };
  }

  const description = await describeCategory(await collectInputs(proposal.windowId), name, group.tabs, signal);

  const updated = [...categories, { id: newCategoryId(), name: name.slice(0, MAX_NAME_LENGTH), description, color: group.color }];
  let saved: Proposal;
  try {
    saved = await keepCurrent(proposal, async () => {
      await saveSettings({ categories: updated });
      return { ...proposal, groups: proposal.groups.map((g) => (g.id === groupId ? { ...g, provenance: 'list' } : g)) };
    });
  } catch (err) {
    if (err instanceof SettingsError) return { proposal, notice: { key: err.messageKey } };
    throw err;
  }
  return { proposal: saved, notice: { key: description ? 'saveToListSaved' : 'saveToListNoDescription', arg: name } };
}
