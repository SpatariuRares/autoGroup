import type { Browser } from 'wxt/browser';
import type { AiOption, AiTab } from '../ai/types';
import { categoryKey } from '../settings';
import type { Category, GroupColor } from '../shared/types';
import type { CandidateTab } from './tab-selection';

/** URL ripulito per l'AI: host e percorso, senza schema, credenziali, query né frammento. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return '';
  }
}

/** Dati delle tab per l'AI, con ID brevi (t1, t2, …), e la tabella per tornare alle tab di Chrome. */
export function prepareTabs(candidates: CandidateTab[]): { tabs: AiTab[]; byShortId: Map<string, CandidateTab> } {
  const byShortId = new Map<string, CandidateTab>();
  const tabs = candidates.map((tab, i) => {
    const id = `t${i + 1}`;
    byShortId.set(id, tab);
    return { id, title: tab.title, url: cleanUrl(tab.url) };
  });
  return { tabs, byShortId };
}

/** Un'opzione nota con quello che serve per costruire il gruppo proposto. */
export interface OptionTarget extends AiOption {
  kind: 'list' | 'existing';
  color: GroupColor;
  /** Solo per i gruppi già aperti. */
  existingGroupId?: number;
}

/**
 * Opzioni per l'AI: categorie della lista più gruppi già aperti nella finestra.
 * Un gruppo aperto con lo stesso nome di una categoria (senza distinguere maiuscole e minuscole)
 * prende il posto della categoria, con la sua descrizione; le tab vi verranno aggiunte.
 * Gli altri gruppi aperti hanno la descrizione `userGroupDescription(nome)`. I gruppi senza nome sono esclusi.
 */
export function buildOptions(
  categories: Category[],
  openGroups: Browser.tabGroups.TabGroup[],
  userGroupDescription: (name: string) => string,
): OptionTarget[] {
  const options: OptionTarget[] = categories.map((c) => ({
    kind: 'list',
    name: c.name,
    description: c.description,
    color: c.color,
  }));
  for (const group of openGroups) {
    const name = group.title?.trim();
    if (!name) continue;
    const existing = { kind: 'existing' as const, color: group.color as GroupColor, existingGroupId: group.id };
    const index = options.findIndex((o) => categoryKey(o.name) === categoryKey(name));
    if (index === -1) {
      options.push({ ...existing, name, description: userGroupDescription(name) });
    } else if (options[index]!.kind === 'list') {
      options[index] = { ...existing, name, description: options[index]!.description };
    }
  }
  return options;
}
