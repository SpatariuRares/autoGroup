import { ProviderError } from '../ai/types';
import { categoryKey, loadSettings, MAX_NAME_LENGTH, newCategoryId, saveSettings, SettingsError } from '../settings';
import type { OrganizerState, Proposal } from '../shared/types';
import { cleanUrl } from './ai-input';
import { languageName, resolveGenerator } from './pipeline';
import { collectInputs, signatureOf } from './proposal-builder';

/** Tab di esempio inviate al Generatore per descrivere la categoria. */
const MAX_EXAMPLES = 8;

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
 * Dopo il salvataggio il gruppo diventa "lista" e l'impronta della proposta viene aggiornata con la
 * nuova lista, così la proposta (con le modifiche dell'utente) resta valida riaprendo il pannello.
 * Le tab sono lette una sola volta, prima della descrizione: se erano già cambiate la proposta resta
 * scaduta, e se cambiano durante la descrizione la nuova impronta non lo nasconde.
 */
export async function saveGroupToList(proposal: Proposal, groupId: string, signal?: AbortSignal): Promise<SaveResult | null> {
  const group = proposal.groups.find((g) => g.id === groupId);
  if (!group || group.provenance !== 'ai') return null;
  const name = group.name.trim();

  const { categories } = await loadSettings();
  if (categories.some((c) => categoryKey(c.name) === categoryKey(name))) {
    return { proposal, notice: { key: 'saveToListDuplicate', arg: name } };
  }

  const inputs = await collectInputs(proposal.windowId);
  const wasCurrent = proposal.signature === signatureOf(inputs);
  const generator = resolveGenerator(inputs);
  let description = '';
  if (generator) {
    try {
      description = await generator.describe(
        {
          name,
          examples: group.tabs.slice(0, MAX_EXAMPLES).map((t, i) => ({ id: `t${i + 1}`, title: t.title, url: cleanUrl(t.url) })),
          language: languageName(),
        },
        signal,
      );
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      console.warn(`autoGroup: descrizione non generata da ${generator.label} (${err.reason})`);
    }
  }

  const updated = [...categories, { id: newCategoryId(), name: name.slice(0, MAX_NAME_LENGTH), description, color: group.color }];
  try {
    await saveSettings({ categories: updated });
  } catch (err) {
    if (err instanceof SettingsError) return { proposal, notice: { key: err.messageKey } };
    throw err;
  }

  const saved: Proposal = {
    ...proposal,
    groups: proposal.groups.map((g) => (g.id === groupId ? { ...g, provenance: 'list' } : g)),
    signature: wasCurrent ? signatureOf({ ...inputs, settings: { ...inputs.settings, categories: updated } }) : proposal.signature,
  };
  return { proposal: saved, notice: { key: description ? 'saveToListSaved' : 'saveToListNoDescription', arg: name } };
}
