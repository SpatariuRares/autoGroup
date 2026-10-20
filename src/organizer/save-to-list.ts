import { categoryKey, loadSettings, MAX_NAME_LENGTH, newCategoryId, saveSettings, SettingsError } from '../settings';
import type { GroupColor, OrganizerState, Proposal } from '../shared/types';
import { setDescribing } from '../shared/describing';
import { describeCategory } from './pipeline';
import { collectInputs, keepCurrent } from './proposal-builder';

interface SaveResult {
  proposal: Proposal;
  notice: NonNullable<OrganizerState['notice']>;
}

/** Il gruppo da aggiungere alle categorie: nome, colore e le tab da cui si ricava la descrizione. */
interface GroupToSave {
  windowId: number;
  name: string;
  color: GroupColor;
  tabs: { title: string; url: string }[];
}

/**
 * Aggiunge un gruppo alla lista delle categorie, con il nome e il colore che ha ora. La categoria si
 * salva subito, senza descrizione; poi, solo in modalità AI (per sito all'AI non arriva nulla), la
 * descrizione si chiede al Generatore e si aggiunge quando arriva. Intanto la categoria è segnata "in
 * descrizione" (`setDescribing`), così la pagina delle impostazioni mostra che sta arrivando; se nel
 * frattempo l'utente ne scrive una, resta la sua. Senza risposta del Generatore resta vuota. Una
 * categoria con lo stesso nome (senza distinguere maiuscole e minuscole) non viene duplicata; un
 * gruppo senza nome non si salva (null).
 *
 * Con una proposta della finestra, `mark` la aggiorna dopo il salvataggio e, se era attuale, resta
 * attuale con la nuova lista e con la descrizione. Se le tab cambiano mentre il Generatore risponde,
 * la proposta resta scaduta.
 */
async function addCategory(
  group: GroupToSave,
  proposal: Proposal | undefined,
  mark: (proposal: Proposal) => Proposal,
  signal?: AbortSignal,
): Promise<{ proposal?: Proposal; notice: SaveResult['notice'] } | null> {
  const name = group.name.trim();
  if (!name) return null;

  const { categories, mode } = await loadSettings();
  if (categories.some((c) => categoryKey(c.name) === categoryKey(name))) {
    return { proposal, notice: { key: 'saveToListDuplicate', arg: name } };
  }

  const id = newCategoryId();
  let saved: Proposal | undefined;
  try {
    saved = await changeKeepingCurrent(proposal, async () => {
      await saveSettings({ categories: [...categories, { id, name: name.slice(0, MAX_NAME_LENGTH), description: '', color: group.color }] });
    }, mark);
  } catch (err) {
    if (err instanceof SettingsError) return { proposal, notice: { key: err.messageKey } };
    throw err;
  }
  if (mode !== 'ai') return { proposal: saved, notice: { key: 'saveToListNoDescription', arg: name } };

  let description = '';
  await setDescribing(id, true);
  try {
    description = await describeCategory(await collectInputs(group.windowId), name, group.tabs, signal);
    if (description) {
      saved = await changeKeepingCurrent(saved, async () => {
        // Riletta adesso: nel frattempo l'utente può aver cambiato la lista o scritto la descrizione.
        const current = (await loadSettings()).categories;
        const category = current.find((c) => c.id === id);
        if (!category || category.description) {
          description = category?.description ?? '';
          return;
        }
        await saveSettings({ categories: current.map((c) => (c.id === id ? { ...c, description } : c)) });
      });
    }
  } finally {
    await setDescribing(id, false);
  }
  return { proposal: saved, notice: { key: description ? 'saveToListSaved' : 'saveToListNoDescription', arg: name } };
}

/** Esegue `change` mantenendo attuale la proposta (se c'è ed era attuale), aggiornata da `mark`. */
async function changeKeepingCurrent(
  proposal: Proposal | undefined,
  change: () => Promise<void>,
  mark: (proposal: Proposal) => Proposal = (p) => p,
): Promise<Proposal | undefined> {
  if (!proposal) {
    await change();
    return undefined;
  }
  return keepCurrent(proposal, async () => {
    await change();
    return mark(proposal);
  });
}

/**
 * "Aggiungi alle categorie" per un gruppo nuovo della proposta che non è già una categoria (nuovo AI,
 * per sito o creato dall'utente), vedi `addCategory`. Dopo il salvataggio il gruppo diventa "lista",
 * così (con le modifiche dell'utente) la proposta resta valida riaprendo il pannello.
 */
export async function saveGroupToList(proposal: Proposal, groupId: string, signal?: AbortSignal): Promise<SaveResult | null> {
  const group = proposal.groups.find((g) => g.id === groupId);
  if (!group || group.provenance === 'list' || group.provenance === 'existing') return null;
  const result = await addCategory(
    { windowId: proposal.windowId, name: group.name, color: group.color, tabs: group.tabs },
    proposal,
    (p) => ({ ...p, groups: p.groups.map((g) => (g.id === groupId ? { ...g, provenance: 'list' } : g)) }),
    signal,
  );
  return result && { proposal: result.proposal!, notice: result.notice };
}

/**
 * "Aggiungi alle categorie" per un gruppo già aperto in Chrome, con il nome e il colore di Chrome e le
 * sue tab, vedi `addCategory`. Una proposta della finestra (`proposal`) resta attuale se lo era.
 */
export async function saveOpenGroupToList(group: GroupToSave, proposal: Proposal | undefined): Promise<{ proposal?: Proposal; notice: SaveResult['notice'] } | null> {
  return addCategory(group, proposal, (p) => p);
}
