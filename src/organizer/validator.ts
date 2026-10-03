import type { RawGroup } from '../ai/types';
import { categoryKey } from '../settings';

export const MAX_NAME_WORDS = 2;

export interface ValidGroup {
  name: string;
  tabIds: string[];
}

/**
 * Valida la risposta di un Generatore. Scarta ID inesistenti, nomi vuoti, nomi nuovi oltre le
 * 2 parole e le tab assegnate a più gruppi: quelle tab restano libere. I nomi delle opzioni note
 * (`knownNames`, già passati da `categoryKey`) sono accettati anche se più lunghi. Unisce i gruppi
 * con lo stesso nome.
 */
export function validateGroups(raw: RawGroup[], knownIds: Set<string>, knownNames: Set<string> = new Set()): ValidGroup[] {
  const groups = new Map<string, ValidGroup>();
  const owners = new Map<string, Set<string>>();

  for (const item of raw) {
    if (typeof item?.name !== 'string' || !Array.isArray(item.tabs)) continue;
    const name = item.name.trim().replace(/\s+/g, ' ');
    const key = categoryKey(name);
    if (!name || (name.split(' ').length > MAX_NAME_WORDS && !knownNames.has(key))) continue;
    const group = groups.get(key) ?? { name, tabIds: [] };
    for (const id of item.tabs) {
      if (typeof id !== 'string' || !knownIds.has(id) || group.tabIds.includes(id)) continue;
      group.tabIds.push(id);
      owners.set(id, (owners.get(id) ?? new Set()).add(key));
    }
    groups.set(key, group);
  }

  const contested = new Set([...owners].filter(([, keys]) => keys.size > 1).map(([id]) => id));
  return [...groups.values()]
    .map((g) => ({ ...g, tabIds: g.tabIds.filter((id) => !contested.has(id)) }))
    .filter((g) => g.tabIds.length > 0);
}
