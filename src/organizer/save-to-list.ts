import { categoryKey, loadSettings, MAX_NAME_LENGTH, newCategoryId, saveSettings, SettingsError } from '../settings';
import type { GroupColor, OrganizerState, Proposal } from '../shared/types';
import { setDescribing } from '../shared/describing';
import { describeCategory } from './pipeline';
import { collectInputs, keepCurrent } from './proposal-builder';

interface SaveResult {
  proposal: Proposal;
  notice: NonNullable<OrganizerState['notice']>;
}

/** The group to add to the categories: name, color and the tabs the description is taken from. */
interface GroupToSave {
  windowId: number;
  name: string;
  color: GroupColor;
  tabs: { title: string; url: string }[];
}

/**
 * Adds a group to the list of categories, with the name and color it has now. The category is saved
 * right away, without a description; then, only in AI mode (in per-site mode nothing reaches the AI), the
 * description is asked of the Generator and added when it arrives. Meanwhile the category is marked
 * "being described" (`setDescribing`), so the settings page shows that it is coming; if in the meantime
 * the user writes one, theirs stays. Without a reply from the Generator it stays empty. A category with
 * the same name (case-insensitive) is not duplicated; a group without a name is not saved (null).
 *
 * With a proposal of the window, `mark` updates it after the save and, if it was current, it stays
 * current with the new list and with the description. If the tabs change while the Generator answers,
 * the proposal stays stale.
 */
async function addCategory(
  group: GroupToSave,
  proposal: Proposal | undefined,
  mark: (proposal: Proposal) => Proposal,
  signal?: AbortSignal,
): Promise<{ proposal?: Proposal; notice: SaveResult['notice'] } | null> {
  const name = group.name.trim();
  if (!name) return null;
  // The outcome is read right away in the snackbar: it does not come back when the panel is reopened (`snackbar`).
  const outcome = (proposal: Proposal | undefined, key: string, arg?: string) => ({ proposal, notice: { key, ...(arg ? { arg } : {}), snackbar: true as const } });

  const { categories, mode } = await loadSettings();
  if (categories.some((c) => categoryKey(c.name) === categoryKey(name))) {
    return outcome(proposal, 'saveToListDuplicate', name);
  }

  const id = newCategoryId();
  let saved: Proposal | undefined;
  try {
    saved = await changeKeepingCurrent(proposal, async () => {
      await saveSettings({ categories: [...categories, { id, name: name.slice(0, MAX_NAME_LENGTH), description: '', color: group.color }] });
    }, mark);
  } catch (err) {
    if (err instanceof SettingsError) return outcome(proposal, err.messageKey);
    throw err;
  }
  if (mode !== 'ai') return outcome(saved, 'saveToListNoDescription', name);

  let description = '';
  await setDescribing(id, true);
  try {
    description = await describeCategory(await collectInputs(group.windowId), name, group.tabs, signal);
    if (description) {
      saved = await changeKeepingCurrent(saved, async () => {
        // Re-read now: in the meantime the user may have changed the list or written the description.
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
  return outcome(saved, description ? 'saveToListSaved' : 'saveToListNoDescription', name);
}

/** Runs `change` keeping the proposal current (if there is one and it was current), updated by `mark`. */
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
 * "Add to categories" for a new group of the proposal that is not already a category (new from the AI,
 * per site or created by the user), see `addCategory`. After the save the group becomes "list",
 * so (with the user's edits) the proposal stays valid when the panel is reopened.
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
 * "Add to categories" for a group already open in Chrome, with Chrome's name and color and its
 * tabs, see `addCategory`. A proposal of the window (`proposal`) stays current if it was.
 */
export async function saveOpenGroupToList(group: GroupToSave, proposal: Proposal | undefined): Promise<{ proposal?: Proposal; notice: SaveResult['notice'] } | null> {
  return addCategory(group, proposal, (p) => p);
}
