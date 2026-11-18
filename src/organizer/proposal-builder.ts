import { browser, type Browser } from 'wxt/browser';
import { nanoAvailability, type NanoAvailability } from '../ai/nano-generator';
import {
  hasDescriptionPermission,
  hasHostPermission,
  isProviderConfigured,
  loadApiKey,
  NANO_PRESET,
  loadSettings,
  type ProviderRole,
  type ProviderSettings,
  type Settings,
} from '../settings';
import type { Proposal } from '../shared/types';
import { domainGroups, runPipeline } from './pipeline';
import type { Stopwatch } from './stopwatch';
import { selectCandidateTabs, type CandidateTab } from './tab-selection';

/** A provider configured by the user, with what is needed to use it. */
export interface ProviderInput {
  settings: ProviderSettings;
  /** Never saved in the state nor in the fingerprint. */
  apiKey: string;
  /** True if the provider is configured and its host permission has been granted. */
  usable: boolean;
  /** True if the provider is configured but the host permission is missing. */
  missingPermission: boolean;
}

/** Everything needed to compute a proposal, read from the browser in one go. */
export interface ProposalInputs {
  windowId: number;
  candidates: CandidateTab[];
  openGroups: Browser.tabGroups.TabGroup[];
  settings: Settings;
  classifier: ProviderInput;
  generator: ProviderInput;
  /** Gemini Nano status; read only if the user has chosen Nano as the Generator and the AI mode. */
  nano: NanoAvailability;
  /** True if the "Read page descriptions" option is on and the <all_urls> permission has been granted. */
  readDescriptions: boolean;
}

async function providerInput(role: ProviderRole, settings: ProviderSettings): Promise<ProviderInput> {
  const configured = isProviderConfigured(role, settings);
  const [apiKey, permitted] = await Promise.all([
    loadApiKey(role),
    configured ? hasHostPermission(settings.baseUrl) : Promise.resolve(false),
  ]);
  return { settings, apiKey, usable: configured && permitted, missingPermission: configured && !permitted };
}

export async function collectInputs(windowId: number): Promise<ProposalInputs> {
  const [tabs, openGroups, settings] = await Promise.all([
    browser.tabs.query({ windowId }),
    browser.tabGroups.query({ windowId }),
    loadSettings(),
  ]);
  const [classifier, generator] = await Promise.all([
    providerInput('classifier', settings.classifier),
    providerInput('generator', settings.generator),
  ]);
  const nano = settings.mode === 'ai' && settings.generator.preset === NANO_PRESET ? await nanoAvailability() : 'unavailable';
  const readDescriptions = settings.readDescriptions && (await hasDescriptionPermission());
  return {
    windowId,
    candidates: selectCandidateTabs(tabs, settings.excludedDomains),
    openGroups,
    settings,
    classifier,
    generator,
    nano,
    readDescriptions,
  };
}

/**
 * Fingerprint of the candidate tabs (ID and URL), of the open groups, of the settings and of the
 * availability of the providers: if it changes, a saved proposal is no longer current. The title stays
 * out because it often changes on its own (counters like "(3) Mail"); the order of the tabs too, because
 * moving them does not change the groups; the API keys are never in it.
 */
export function signatureOf(inputs: ProposalInputs): string {
  // Automatic grouping does not change the proposal: turning it on or off does not make it stale.
  const { autoGroupSites: _, ...settings } = inputs.settings;
  return JSON.stringify([
    [...inputs.candidates].sort((a, b) => a.tabId - b.tabId).map((t) => [t.tabId, t.url]),
    inputs.openGroups.map((g) => [g.id, g.title, g.color]),
    settings,
    inputs.classifier.usable,
    inputs.generator.usable,
    inputs.nano,
    inputs.readDescriptions,
  ]);
}

/**
 * Runs a change that touches the window or the settings and also the proposal (closed tabs, remembered
 * site, saved category). If the proposal was current right before the change, it stays current:
 * the fingerprint is read again afterwards. If it was already stale, it stays stale, with the old fingerprint.
 */
export async function keepCurrent(proposal: Proposal, change: () => Promise<Proposal>): Promise<Proposal> {
  const wasCurrent = proposal.signature === signatureOf(await collectInputs(proposal.windowId));
  const next = await change();
  return wasCurrent ? { ...next, signature: signatureOf(await collectInputs(next.windowId)) } : next;
}

/**
 * Computes the proposal going through the pipeline (AI levels and grouping by domain).
 * With `clock`, the proposal also reports the duration of each phase.
 */
export async function buildProposal(inputs: ProposalInputs, signal?: AbortSignal, clock?: Stopwatch): Promise<Proposal> {
  const { groups, warnings } = await runPipeline(inputs, signal, clock);
  const proposal: Proposal = { windowId: inputs.windowId, createdAt: Date.now(), signature: signatureOf(inputs), groups, warnings };
  return clock ? { ...proposal, timings: clock.timings() } : proposal;
}

/**
 * Per-site preview: the grouping by domain of the same tabs, without AI nor pages read.
 * It has the same fingerprint as the AI proposal about to arrive, so if the user chooses it, it stays current.
 */
export function buildPreview(inputs: ProposalInputs): Proposal {
  return { windowId: inputs.windowId, createdAt: Date.now(), signature: signatureOf(inputs), groups: domainGroups(inputs), warnings: [] };
}
