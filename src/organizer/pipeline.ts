import { browser } from 'wxt/browser';
import { createNanoGenerator, NANO_LABEL } from '../ai/nano-generator';
import { createOpenAiGenerator } from '../ai/openai-generator';
import { createSystemOneClassifier } from '../ai/systemone-classifier';
import { ProviderError, type AiOption, type AiTab, type Classifier, type Generator } from '../ai/types';
import { categoryKey, providerLabel } from '../settings';
import type { GroupColor, ProposalWarning, ProposedGroup } from '../shared/types';
import { buildOptions, prepareTabs } from './ai-input';
import { createColorAssigner } from './colors';
import { readDescriptions } from './description-reader';
import { groupByDomain } from './domain-grouping';
import { applyGroupRules, type RulesContext } from './group-rules';
import type { ProposalInputs } from './proposal-builder';
import { validateGroups, type ValidGroup } from './validator';

interface PipelineResult {
  groups: ProposedGroup[];
  warnings: ProposalWarning[];
}

/** Il Classificatore configurato, se utilizzabile; altrimenti nessuno (con un avviso se manca il permesso). */
function resolveClassifier(inputs: ProposalInputs, warnings: ProposalWarning[]): Classifier | null {
  const { settings, apiKey, usable, missingPermission } = inputs.classifier;
  const label = providerLabel('classifier', settings);
  if (missingPermission) warnings.push({ level: 'classifier', provider: label, cause: 'no-permission' });
  if (!usable) return null;
  return createSystemOneClassifier({ label, baseUrl: settings.baseUrl, model: settings.model, apiKey });
}

/**
 * Il Generatore scelto dall'utente: un server compatibile OpenAI, Gemini Nano (se disponibile) o
 * nessuno. Un Generatore senza permesso host e un Gemini Nano ancora da scaricare o in download
 * producono un avviso. `inputs.nano` è "unavailable" se l'utente non ha scelto Nano.
 */
export function resolveGenerator(inputs: ProposalInputs, warnings: ProposalWarning[] = []): Generator | null {
  const { settings, apiKey, usable, missingPermission } = inputs.generator;
  const label = providerLabel('generator', settings);
  if (usable) return createOpenAiGenerator({ label, baseUrl: settings.baseUrl, model: settings.model, apiKey });
  if (missingPermission) warnings.push({ level: 'generator', provider: label, cause: 'no-permission' });
  switch (inputs.nano) {
    case 'available':
      return createNanoGenerator();
    case 'downloadable':
      warnings.push({ level: 'generator', provider: NANO_LABEL, cause: 'needs-download' });
      break;
    case 'downloading':
      warnings.push({ level: 'generator', provider: NANO_LABEL, cause: 'downloading' });
      break;
  }
  return null;
}

/** Lingua dei nomi nuovi, presa dalla lingua del browser. */
export function languageName(): string {
  return browser.i18n.getMessage('aiLanguageName' as never) || browser.i18n.getUILanguage();
}

/** Dati comuni ai livelli AI: tab con ID brevi (e descrizioni, se lette), opzioni, contesto delle regole. */
function aiContext(inputs: ProposalInputs, descriptions: Map<number, string>) {
  const { tabs, byShortId } = prepareTabs(inputs.candidates, descriptions);
  const options = buildOptions(inputs.settings.categories, inputs.openGroups, (name) =>
    browser.i18n.getMessage('userGroupDescription' as never, name),
  );
  const rules: RulesContext = {
    options,
    byShortId,
    minTabs: inputs.settings.minTabs,
    usedColors: inputs.openGroups.map((g) => g.color),
  };
  return {
    tabs,
    options,
    aiOptions: options.map(({ name, description }): AiOption => ({ name, description })),
    knownNames: new Set(options.map((o) => categoryKey(o.name))),
    rules,
  };
}

/**
 * Registra il fallimento di un provider come avviso, così la pipeline può scendere di livello e
 * l'utente riceve comunque una proposta. Solo "Interrompi" (`signal` interrotto) viene rilanciato.
 * Un errore inatteso (non `ProviderError`) viene registrato come "risposta non valida".
 */
function recordFailure(
  err: unknown,
  level: ProposalWarning['level'],
  provider: string,
  warnings: ProposalWarning[],
  signal?: AbortSignal,
): void {
  if (signal?.aborted) throw err;
  if (err instanceof ProviderError) {
    console.warn(`autoGroup: ${provider} non disponibile (${err.reason})`, err.message);
    warnings.push({ level, provider, cause: err.reason });
  } else {
    console.error(`autoGroup: errore inatteso da ${provider}`, err);
    warnings.push({ level, provider, cause: 'invalid-response' });
  }
}

/**
 * Modalità AI. Tabella dei fallback del PRD:
 *
 * | Classificatore | Generatore | Comportamento                                                    |
 * |----------------|------------|------------------------------------------------------------------|
 * | sì             | sì         | passo 1, poi passo 2 (Generatore "solo nuovi") sulle tab rimaste |
 * | sì             | no         | solo passo 1, le tab rimaste restano libere                      |
 * | no             | sì         | Generatore in modalità "completo"                                |
 * | no             | no         | raggruppamento per dominio                                       |
 *
 * Se un provider va in errore si scende di un livello e si aggiunge un avviso.
 */
export async function runPipeline(inputs: ProposalInputs, signal?: AbortSignal): Promise<PipelineResult> {
  // Modalità "solo dominio": nessuna AI, nessuna pagina letta, nessun avviso sui provider.
  if (inputs.settings.mode === 'domain') return { groups: domainGroups(inputs), warnings: [] };
  const warnings: ProposalWarning[] = [];
  const classifier = resolveClassifier(inputs, warnings);
  const generator = resolveGenerator(inputs, warnings);
  if (inputs.candidates.length === 0) return { groups: [], warnings };
  // Le descrizioni servono solo all'AI: senza Classificatore né Generatore non si legge nessuna pagina.
  const descriptions = inputs.readDescriptions && (classifier || generator) ? await readDescriptions(inputs.candidates) : new Map<number, string>();
  signal?.throwIfAborted();
  const ctx = aiContext(inputs, descriptions);

  // Senza opzioni (nessuna categoria né gruppo aperto) il Classificatore potrebbe solo rispondere "nessuna".
  if (classifier && ctx.options.length > 0) {
    try {
      return { groups: await classifyThenGenerate(classifier, generator, inputs, ctx, warnings, signal), warnings };
    } catch (err) {
      recordFailure(err, 'classifier', classifier.label, warnings, signal);
    }
  }
  if (generator) {
    try {
      const raw = await generator.generate({ mode: 'full', tabs: ctx.tabs, options: ctx.aiOptions, language: languageName() }, signal);
      const valid = validateGroups(raw, new Set(ctx.rules.byShortId.keys()), ctx.knownNames);
      return { groups: applyGroupRules(valid, ctx.rules).groups, warnings };
    } catch (err) {
      recordFailure(err, 'generator', generator.label, warnings, signal);
    }
  }
  return { groups: domainGroups(inputs), warnings };
}

/**
 * Righe 1 e 2. Passo 1: il Classificatore assegna ogni tab a un'opzione nota; diventano "rimaste"
 * le tab sotto soglia e quelle di una categoria che resterebbe sotto il minimo. Passo 2 (solo se c'è
 * un Generatore e le tab rimaste bastano per un gruppo nuovo): il Generatore inventa gruppi nuovi per le rimaste; i gruppi
 * nuovi sotto il minimo vengono sciolti. Se il passo 2 fallisce, le rimaste restano libere.
 */
async function classifyThenGenerate(
  classifier: Classifier,
  generator: Generator | null,
  inputs: ProposalInputs,
  ctx: ReturnType<typeof aiContext>,
  warnings: ProposalWarning[],
  signal?: AbortSignal,
): Promise<ProposedGroup[]> {
  const classified = await classifier.classify(ctx.tabs, ctx.aiOptions, signal);
  const byOption = new Map<string, ValidGroup>();
  const uncertain: string[] = [];
  for (const tab of ctx.tabs) {
    const result = classified.get(tab.id);
    if (!result?.choice || result.confidence < inputs.settings.threshold) {
      uncertain.push(tab.id);
      continue;
    }
    const key = categoryKey(result.choice);
    const group = byOption.get(key) ?? { name: result.choice, tabIds: [] };
    group.tabIds.push(tab.id);
    byOption.set(key, group);
  }

  const step1 = applyGroupRules([...byOption.values()], ctx.rules);
  const kept = [...byOption.values()].filter((g) => !g.tabIds.some((id) => step1.leftover.includes(id)));
  const leftover = [...uncertain, ...step1.leftover];

  let step2: ValidGroup[] = [];
  // Con meno rimaste del minimo il passo 2 non potrebbe creare nessun gruppo nuovo valido.
  if (generator && leftover.length >= inputs.settings.minTabs) {
    const tabs = ctx.tabs.filter((t: AiTab) => leftover.includes(t.id));
    try {
      const raw = await generator.generate({ mode: 'new-only', tabs, options: ctx.aiOptions, language: languageName() }, signal);
      step2 = validateGroups(raw, new Set(leftover), ctx.knownNames);
    } catch (err) {
      recordFailure(err, 'generator', generator.label, warnings, signal);
    }
  }
  return applyGroupRules(mergeByName([...kept, ...step2]), ctx.rules).groups;
}

/** Unisce i gruppi con lo stesso nome (es. una categoria del passo 1 riproposta dal passo 2). */
function mergeByName(groups: ValidGroup[]): ValidGroup[] {
  const merged = new Map<string, ValidGroup>();
  for (const g of groups) {
    const key = categoryKey(g.name);
    const existing = merged.get(key);
    if (existing) existing.tabIds.push(...g.tabIds.filter((id) => !existing.tabIds.includes(id)));
    else merged.set(key, { name: g.name, tabIds: [...g.tabIds] });
  }
  return [...merged.values()];
}

/** Ultimo livello: raggruppamento per dominio. */
function domainGroups(inputs: ProposalInputs): ProposedGroup[] {
  const colors = createColorAssigner(inputs.openGroups.map((g) => g.color));
  // Un gruppo aperto che si chiama come il dominio (es. "github.com") riceve le tab di quel sito.
  const open = new Map(inputs.openGroups.filter((g) => g.title?.trim()).map((g) => [categoryKey(g.title!), g]));
  return groupByDomain(inputs.candidates, inputs.settings.minTabs, new Set(open.keys())).map((group, i): ProposedGroup => {
    const tabs = group.tabs.map(({ tabId, title, url, favIconUrl }) => ({ tabId, title, url, favIconUrl }));
    const existing = open.get(categoryKey(group.name));
    if (existing) {
      return { id: `g${i + 1}`, name: existing.title!, color: existing.color as GroupColor, provenance: 'existing', existingGroupId: existing.id, tabs };
    }
    return { id: `g${i + 1}`, name: group.name, color: colors.next(), provenance: 'domain', tabs };
  });
}

