import { browser } from 'wxt/browser';
import { createNanoGenerator, NANO_LABEL } from '../ai/nano-generator';
import { createOpenAiGenerator } from '../ai/openai-generator';
import { createSystemOneClassifier } from '../ai/systemone-classifier';
import { ProviderError, type AiOption, type AiTab, type Classifier, type Generator } from '../ai/types';
import { categoryKey, providerLabel } from '../settings';
import type { ProposalWarning, ProposedGroup } from '../shared/types';
import { buildOptions, prepareTabs } from './ai-input';
import { withClassificationCache } from './classification-cache';
import { readDescriptions } from './description-reader';
import { domainOf } from './domain-grouping';
import { applyGroupRules, type RulesContext } from './group-rules';
import type { ProposalInputs } from './proposal-builder';
import { createSiteMatcher, type SiteMatch } from './site-rules';
import type { Stopwatch } from './stopwatch';
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
  return withClassificationCache(createSystemOneClassifier({ label, baseUrl: settings.baseUrl, model: settings.model, apiKey }), settings);
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

/**
 * Vero se il calcolo interrogherà almeno un livello AI: modalità AI, qualche tab candidata che
 * nessuna regola sui siti ha preso e un Classificatore o un Generatore utilizzabile. Solo allora vale
 * la pena mostrare l'anteprima per sito.
 */
export function willAskAi(inputs: ProposalInputs): boolean {
  if (inputs.settings.mode !== 'ai') return false;
  const matches = siteMatches(inputs);
  if (!inputs.candidates.some((t) => !matches.has(t.tabId))) return false;
  return inputs.classifier.usable || inputs.generator.usable || inputs.nano === 'available';
}

/** Lingua dei nomi nuovi, presa dalla lingua del browser. */
export function languageName(): string {
  return browser.i18n.getMessage('aiLanguageName' as never) || browser.i18n.getUILanguage();
}

/** Le tab candidate prese da una regola sui siti: ID della tab in Chrome → regola. */
function siteMatches(inputs: ProposalInputs): Map<number, SiteMatch> {
  const match = createSiteMatcher(inputs.settings.categories, inputs.settings.categorySites);
  const result = new Map<number, SiteMatch>();
  for (const tab of inputs.candidates) {
    const found = match(tab.url);
    if (found) result.set(tab.tabId, found);
  }
  return result;
}

/**
 * Dati comuni a tutti i livelli. Gli ID brevi valgono per tutte le candidate, così i gruppi delle
 * regole sui siti (`siteGroups`, uno per categoria) e quelli dell'AI o del dominio si uniscono per nome.
 * `tabs` contiene solo le tab che nessuna regola ha preso: sono le sole che vedono l'AI e il dominio.
 */
function groupingContext(inputs: ProposalInputs, matches = siteMatches(inputs), descriptions: Map<number, string> = new Map()) {
  const { tabs, byShortId } = prepareTabs(inputs.candidates, descriptions);
  const options = buildOptions(inputs.settings.categories, inputs.openGroups, (name) =>
    browser.i18n.getMessage('userGroupDescription' as never, name),
  );
  const siteOf = new Map<string, string>();
  const bySite = new Map<string, ValidGroup>();
  for (const [id, tab] of byShortId) {
    const match = matches.get(tab.tabId);
    if (!match) continue;
    siteOf.set(id, match.site);
    const key = categoryKey(match.category.name);
    const group = bySite.get(key) ?? { name: match.category.name, tabIds: [] };
    group.tabIds.push(id);
    bySite.set(key, group);
  }
  const rules: RulesContext = {
    options,
    byShortId,
    minTabs: inputs.settings.minTabs,
    usedColors: inputs.openGroups.map((g) => g.color),
    siteOf,
  };
  return {
    tabs: tabs.filter((t) => !siteOf.has(t.id)),
    options,
    aiOptions: options.map(({ name, description }): AiOption => ({ name, description })),
    knownNames: new Set(options.map((o) => categoryKey(o.name))),
    rules,
    siteGroups: [...bySite.values()],
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
 *
 * Prima di tutto le regole sui siti: le tab che prendono non arrivano all'AI e i loro gruppi si uniscono per nome a quelli dell'AI (o del dominio, nel ripiego).
 */
export async function runPipeline(inputs: ProposalInputs, signal?: AbortSignal, clock?: Stopwatch): Promise<PipelineResult> {
  const byDomain = (warnings: ProposalWarning[]): PipelineResult => {
    const groups = domainGroups(inputs);
    clock?.lap('domain');
    return { groups, warnings };
  };
  // Modalità "solo dominio": nessuna AI, nessuna pagina letta, nessun avviso sui provider.
  if (inputs.settings.mode === 'domain') return byDomain([]);
  const warnings: ProposalWarning[] = [];
  const classifier = resolveClassifier(inputs, warnings);
  const generator = resolveGenerator(inputs, warnings);
  if (inputs.candidates.length === 0) return { groups: [], warnings };
  const matches = siteMatches(inputs);
  const rest = inputs.candidates.filter((t) => !matches.has(t.tabId));
  // Tutte le tab sono già decise dalle regole sui siti: nessuna richiesta all'AI.
  if (rest.length === 0) return byDomain(warnings);
  // Gemini Nano prepara la sessione mentre si leggono le pagine e lavora il Classificatore.
  generator?.prepare?.(classifier ? 'new-only' : 'full', languageName());
  // Le descrizioni servono solo all'AI: senza Classificatore né Generatore non si legge nessuna pagina,
  // e le pagine prese dalle regole non si leggono mai.
  const descriptions = inputs.readDescriptions && (classifier || generator) ? await readDescriptions(rest) : new Map<number, string>();
  signal?.throwIfAborted();
  clock?.lap('descriptions');
  const ctx = groupingContext(inputs, matches, descriptions);

  // Senza opzioni (nessuna categoria né gruppo aperto) il Classificatore potrebbe solo rispondere "nessuna".
  if (classifier && ctx.options.length > 0) {
    try {
      return { groups: await classifyThenGenerate(classifier, generator, inputs, ctx, warnings, signal, clock), warnings };
    } catch (err) {
      clock?.lap('classifier');
      recordFailure(err, 'classifier', classifier.label, warnings, signal);
    }
  }
  if (generator) {
    try {
      const raw = await generator.generate({ mode: 'full', tabs: ctx.tabs, options: ctx.aiOptions, language: languageName() }, signal);
      // Solo gli ID delle tab inviate: un ID delle regole nella risposta viene ignorato.
      const valid = validateGroups(raw, new Set(ctx.tabs.map((t) => t.id)), ctx.knownNames);
      const groups = applyGroupRules(mergeByName([...ctx.siteGroups, ...valid]), ctx.rules).groups;
      clock?.lap('generator');
      return { groups, warnings };
    } catch (err) {
      clock?.lap('generator');
      recordFailure(err, 'generator', generator.label, warnings, signal);
    }
  }
  return byDomain(warnings);
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
  ctx: ReturnType<typeof groupingContext>,
  warnings: ProposalWarning[],
  signal?: AbortSignal,
  clock?: Stopwatch,
): Promise<ProposedGroup[]> {
  const classified = await classifier.classify(ctx.tabs, ctx.aiOptions, signal);
  clock?.lap('classifier');
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

  // Le tab delle regole contano per il minimo della loro categoria insieme a quelle del Classificatore.
  const step1Groups = mergeByName([...ctx.siteGroups, ...byOption.values()]);
  const step1 = applyGroupRules(step1Groups, ctx.rules);
  const kept = step1Groups.filter((g) => !g.tabIds.some((id) => step1.leftover.includes(id)));
  // Le tab delle regole rimaste sotto il minimo restano libere: il Generatore non deve metterle altrove.
  const leftover = [...uncertain, ...step1.leftover.filter((id) => !ctx.rules.siteOf?.has(id))];

  let step2: ValidGroup[] = [];
  // Con meno rimaste del minimo il passo 2 non potrebbe creare nessun gruppo nuovo valido.
  if (generator && leftover.length >= inputs.settings.minTabs) {
    const tabs = ctx.tabs.filter((t: AiTab) => leftover.includes(t.id));
    try {
      const raw = await generator.generate({ mode: 'new-only', tabs, options: ctx.aiOptions, language: languageName() }, signal);
      step2 = validateGroups(raw, new Set(leftover), ctx.knownNames);
    } catch (err) {
      recordFailure(err, 'generator', generator.label, warnings, signal);
    } finally {
      clock?.lap('generator');
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

/**
 * Regole sui siti, poi raggruppamento per dominio delle altre tab: modalità per sito, ultimo livello della pipeline e anteprima mostrata
 * mentre l'AI calcola. Minimo di tab, gruppi aperti con lo stesso nome (es. "github.com") e colori
 * seguono `applyGroupRules`, come per l'AI.
 */
export function domainGroups(inputs: ProposalInputs): ProposedGroup[] {
  const ctx = groupingContext(inputs);
  const byDomain = new Map<string, ValidGroup>();
  for (const { id } of ctx.tabs) {
    const domain = domainOf(ctx.rules.byShortId.get(id)!.url);
    if (!domain) continue;
    const group = byDomain.get(domain) ?? { name: domain, tabIds: [] };
    group.tabIds.push(id);
    byDomain.set(domain, group);
  }
  return applyGroupRules(mergeByName([...ctx.siteGroups, ...byDomain.values()]), ctx.rules, 'domain').groups;
}
