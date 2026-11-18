import { browser } from 'wxt/browser';
import { createNanoGenerator, NANO_LABEL } from '../ai/nano-generator';
import { createOpenAiGenerator } from '../ai/openai-generator';
import { createSystemOneClassifier } from '../ai/systemone-classifier';
import { ProviderError, type AiOption, type AiTab, type Classifier, type Generator } from '../ai/types';
import { categoryKey, isRulesOnly, NANO_PRESET, providerLabel } from '../settings';
import type { ProposalWarning, ProposedGroup } from '../shared/types';
import { buildOptions, cleanUrl, prepareTabs } from './ai-input';
import { withClassificationCache } from './classification-cache';
import { readDescriptions } from './description-reader';
import { applyGroupRules, type RulesContext } from './group-rules';
import type { ProposalInputs } from './proposal-builder';
import { createSiteMatcher, type SiteMatch } from './site-rules';
import type { Stopwatch } from './stopwatch';
import { domainOf, isExcluded, isInternalUrl } from './tab-selection';
import { validateGroups, type ValidGroup } from './validator';

interface PipelineResult {
  groups: ProposedGroup[];
  warnings: ProposalWarning[];
}

/** The configured Classifier, if usable; otherwise none (with a warning if the permission is missing). */
function resolveClassifier(inputs: ProposalInputs, warnings: ProposalWarning[]): Classifier | null {
  const { settings, apiKey, usable, missingPermission } = inputs.classifier;
  const label = providerLabel('classifier', settings);
  if (missingPermission) warnings.push({ level: 'classifier', provider: label, cause: 'no-permission' });
  if (!usable) return null;
  return withClassificationCache(createSystemOneClassifier({ label, baseUrl: settings.baseUrl, model: settings.model, apiKey }), settings);
}

/**
 * The Generator chosen by the user: an OpenAI-compatible server, Gemini Nano (if available) or
 * none. A Generator without host permission, and a Gemini Nano still to be downloaded, downloading or
 * unsupported, produce a warning: without it the user would see groups by site thinking the AI made them.
 * `inputs.nano` is "unavailable" even if the user did not choose Nano: there, no warning.
 */
function resolveGenerator(inputs: ProposalInputs, warnings: ProposalWarning[] = []): Generator | null {
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
    case 'unavailable':
      if (settings.preset === NANO_PRESET) warnings.push({ level: 'generator', provider: NANO_LABEL, cause: 'not-supported' });
      break;
  }
  return null;
}

/**
 * True if the computation will query at least one AI level: AI mode, some candidate tab that no site
 * rule has taken, and a usable Classifier or Generator. Only then is it worth showing the per-site preview.
 */
export function willAskAi(inputs: ProposalInputs): boolean {
  if (inputs.settings.mode !== 'ai') return false;
  const matches = siteMatches(inputs);
  if (!inputs.candidates.some((t) => !matches.has(t.tabId))) return false;
  return inputs.classifier.usable || inputs.generator.usable || inputs.nano === 'available';
}

/** Language of the new names, taken from the browser's language. */
function languageName(): string {
  return browser.i18n.getMessage('aiLanguageName' as never) || browser.i18n.getUILanguage();
}

/** Example tabs sent to the Generator to describe a category. */
const MAX_EXAMPLES = 8;

/**
 * The description of a new category ("Add to categories"), asked of the same Generator as the pipeline
 * with some example tabs, from the cleaned-up URLs: never browser pages or excluded domains.
 * Empty string if there is no Generator or if it does not answer.
 */
export async function describeCategory(
  inputs: ProposalInputs,
  name: string,
  tabs: { title: string; url: string }[],
  signal?: AbortSignal,
): Promise<string> {
  const generator = resolveGenerator(inputs);
  if (!generator) return '';
  // The examples of an open group may be browser pages or of excluded domains: they never leave.
  const allowed = tabs.filter((t) => !isInternalUrl(t.url) && !isExcluded(t.url, inputs.settings.excludedDomains));
  const examples = allowed.slice(0, MAX_EXAMPLES).map((t, i) => ({ id: `t${i + 1}`, title: t.title, url: cleanUrl(t.url) }));
  try {
    return await generator.describe({ name, examples, language: languageName() }, signal);
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    console.warn(`autoGroup: description not generated by ${generator.label} (${err.reason})`);
    return '';
  }
}

/** The candidate tabs taken by a site rule: Chrome tab ID → rule. */
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
 * Data common to all levels. The short IDs are valid for all the candidates, so the groups of the
 * site rules (`siteGroups`, one per category) and those of the AI or of the domain merge by name.
 * `tabs` contains only the tabs that no rule has taken: they are the only ones the AI and the domain see.
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
 * Records a provider's failure as a warning, so the pipeline can step down a level and the user
 * still gets a proposal. Only "Stop" (`signal` aborted) is rethrown.
 * An unexpected error (not a `ProviderError`) is recorded as "invalid response".
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
    console.warn(`autoGroup: ${provider} unavailable (${err.reason})`, err.message);
    warnings.push({ level, provider, cause: err.reason });
  } else {
    console.error(`autoGroup: unexpected error from ${provider}`, err);
    warnings.push({ level, provider, cause: 'invalid-response' });
  }
}

/**
 * AI mode. Fallback table from the PRD:
 *
 * | Classifier | Generator | Behavior                                                        |
 * | yes        | yes       | step 1, then step 2 (Generator "new only") on the leftover tabs |
 * | yes        | no        | only step 1, the leftover tabs stay free                        |
 * | no         | yes       | Generator in "full" mode                                        |
 * | no         | no        | grouping by domain                                              |
 *
 * If a provider fails, it steps down a level and a warning is added. With both set to "None" (`isRulesOnly`)
 * only the site rules apply, without the grouping by domain.
 *
 * First of all, the site rules: the tabs they take do not reach the AI, and their groups merge by name with those of the AI (or of the domain, in the fallback).
 */
export async function runPipeline(inputs: ProposalInputs, signal?: AbortSignal, clock?: Stopwatch): Promise<PipelineResult> {
  const byDomain = (warnings: ProposalWarning[]): PipelineResult => {
    const groups = domainGroups(inputs);
    clock?.lap('domain');
    return { groups, warnings };
  };
  // "By site" mode: no AI, no page read, no warning about the providers.
  if (inputs.settings.mode === 'domain') return byDomain([]);
  // "With rules": only the site rules; the other tabs stay free.
  if (isRulesOnly(inputs.settings)) return { groups: ruleGroups(inputs), warnings: [] };
  const warnings: ProposalWarning[] = [];
  const classifier = resolveClassifier(inputs, warnings);
  const generator = resolveGenerator(inputs, warnings);
  if (inputs.candidates.length === 0) return { groups: [], warnings };
  const matches = siteMatches(inputs);
  const rest = inputs.candidates.filter((t) => !matches.has(t.tabId));
  // All the tabs are already decided by the site rules: no request to the AI.
  if (rest.length === 0) return byDomain(warnings);
  // Gemini Nano prepares the session while the pages are read and the Classifier works.
  generator?.prepare?.(classifier ? 'new-only' : 'full', languageName());
  // Descriptions are needed only by the AI: without a Classifier nor a Generator no page is read,
  // and the pages taken by the rules are never read.
  const descriptions = inputs.readDescriptions && (classifier || generator) ? await readDescriptions(rest) : new Map<number, string>();
  signal?.throwIfAborted();
  clock?.lap('descriptions');
  const ctx = groupingContext(inputs, matches, descriptions);

  // Without options (no category nor open group) the Classifier could only answer "none".
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
      // Only the IDs of the tabs sent: an ID of the rules in the response is ignored.
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
 * Rows 1 and 2 of the table above. Step 1: the Classifier assigns each tab to a known option; the tabs
 * below the threshold become "leftover", and so do those of a category that would stay below the minimum.
 * Step 2 (only if there is a Generator and the leftover tabs are enough for a new group): the Generator
 * invents new groups for the leftover tabs; the new groups below the minimum are dissolved. If step 2
 * fails, the leftover tabs stay free.
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

  // The tabs of the rules count toward the minimum of their category together with those of the Classifier.
  const step1Groups = mergeByName([...ctx.siteGroups, ...byOption.values()]);
  const step1 = applyGroupRules(step1Groups, ctx.rules);
  const kept = step1Groups.filter((g) => !g.tabIds.some((id) => step1.leftover.includes(id)));
  // The rule tabs left below the minimum stay free: the Generator must not put them elsewhere.
  const leftover = [...uncertain, ...step1.leftover.filter((id) => !ctx.rules.siteOf?.has(id))];

  let step2: ValidGroup[] = [];
  // With fewer leftover tabs than the minimum, step 2 could not create any valid new group.
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

/** Merges the groups with the same name (e.g. a category of step 1 proposed again by step 2). */
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

/** Only the groups of the site rules ("With rules" mode), with the minimum and open groups as for the AI. */
function ruleGroups(inputs: ProposalInputs): ProposedGroup[] {
  const ctx = groupingContext(inputs);
  return applyGroupRules(ctx.siteGroups, ctx.rules).groups;
}

/**
 * Site rules, then grouping by domain of the other tabs: per-site mode, the last level of the pipeline and the preview
 * shown while the AI computes. Minimum of tabs, open groups with the same name (e.g. "github.com") and colors
 * follow `applyGroupRules`, as for the AI.
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
