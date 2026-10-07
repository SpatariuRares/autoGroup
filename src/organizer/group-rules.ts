import { categoryKey } from '../settings';
import type { ProposedGroup, ProposedTab } from '../shared/types';
import type { OptionTarget } from './ai-input';
import { createColorAssigner } from './colors';
import type { CandidateTab } from './tab-selection';
import type { ValidGroup } from './validator';

export interface RulesContext {
  options: OptionTarget[];
  byShortId: Map<string, CandidateTab>;
  minTabs: number;
  /** Colori dei gruppi già aperti nella finestra. */
  usedColors: string[];
  /** ID brevi delle tab prese da una regola sui siti → sito della regola. */
  siteOf?: Map<string, string>;
}

export interface RulesResult {
  groups: ProposedGroup[];
  /** ID brevi delle tab rimaste libere (gruppo nuovo o categoria sotto il minimo). */
  leftover: string[];
}

const toProposedTab = ({ tabId, title, url, favIconUrl }: CandidateTab): ProposedTab => ({ tabId, title, url, favIconUrl });

/**
 * Regole sui gruppi e colori, uguali per ogni livello (AI e dominio).
 * - Un gruppo esistente accoglie anche una sola tab; nome e colore restano i suoi.
 * - Una categoria della lista o un gruppo nuovo richiedono almeno `minTabs` tab.
 * - Le categorie usano il loro colore fisso; i gruppi nuovi ruotano tra i colori liberi nella finestra.
 * I gruppi che non corrispondono a nessuna opzione nota hanno la provenienza `newProvenance`.
 */
export function applyGroupRules(valid: ValidGroup[], ctx: RulesContext, newProvenance: 'ai' | 'domain' = 'ai'): RulesResult {
  const optionByKey = new Map(ctx.options.map((o) => [categoryKey(o.name), o]));
  const leftover: string[] = [];
  const kept: { group: ValidGroup; option?: OptionTarget }[] = [];

  for (const group of valid) {
    const option = optionByKey.get(categoryKey(group.name));
    if (option?.kind !== 'existing' && group.tabIds.length < ctx.minTabs) {
      leftover.push(...group.tabIds);
      continue;
    }
    kept.push({ group, option });
  }

  const colors = createColorAssigner(ctx.usedColors);
  for (const { option } of kept) if (option?.kind === 'list') colors.reserve(option.color);

  const groups = kept.map(({ group, option }, i): ProposedGroup => {
    const tabs = group.tabIds.map((id) => {
      const tab = toProposedTab(ctx.byShortId.get(id)!);
      const rule = ctx.siteOf?.get(id);
      return rule ? { ...tab, rule } : tab;
    });
    const id = `g${i + 1}`;
    if (option?.kind === 'existing') {
      return { id, name: option.name, color: option.color, provenance: 'existing', existingGroupId: option.existingGroupId, tabs };
    }
    if (option?.kind === 'list') return { id, name: option.name, color: option.color, provenance: 'list', tabs };
    return { id, name: group.name, color: colors.next(), provenance: newProvenance, tabs };
  });

  return { groups, leftover };
}
