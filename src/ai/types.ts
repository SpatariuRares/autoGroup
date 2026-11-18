import type { ProposalWarning } from '../shared/types';

/** A tab as the AI sees it: short ID, title and cleaned URL. Never Chrome's IDs. */
export interface AiTab {
  id: string;
  title: string;
  url: string;
  description?: string;
}

/** A known option: a category from the list or an already open group. */
export interface AiOption {
  name: string;
  description: string;
}

export interface GenerateRequest {
  /** "full": chooses among the options or invents; "new-only": invents groups for the tabs left over (AG-08). */
  mode: 'full' | 'new-only';
  tabs: AiTab[];
  options: AiOption[];
  /** Language of the new names, e.g. "italiano". */
  language: string;
}

/** Raw Generator response, still to be validated. */
export interface RawGroup {
  name: unknown;
  tabs: unknown;
}

/** Common contract of the Generators (OpenAI-compatible, Gemini Nano). */
export interface Generator {
  /** Provider name for the warnings, e.g. "OpenRouter (openrouter.ai)". */
  readonly label: string;
  generate(request: GenerateRequest, signal?: AbortSignal): Promise<RawGroup[]>;
  /**
   * Optional: prepares in advance what `generate` needs with this mode and language
   * (Gemini Nano creates the session), while the pipeline does something else. Never fails.
   */
  prepare?(mode: GenerateRequest['mode'], language: string): void;
  /** Description of a category from its name and a few example tabs ("Save to the list"). */
  describe(request: DescribeRequest, signal?: AbortSignal): Promise<string>;
}

export interface DescribeRequest {
  name: string;
  examples: AiTab[];
  /** Language of the description, e.g. "italiano". */
  language: string;
}

/** Classifier outcome for a tab: chosen option (null = none) and calibrated confidence. */
export interface Classification {
  choice: string | null;
  confidence: number;
}

/** Common contract of the Classifiers (System One protocol). */
export interface Classifier {
  readonly label: string;
  /** For each short tab ID, the chosen option and the confidence. */
  classify(tabs: AiTab[], options: AiOption[], signal?: AbortSignal): Promise<Map<string, Classification>>;
}

type ProviderErrorCause = ProposalWarning['cause'];

/** Error from an AI provider, already classified by cause. */
export class ProviderError extends Error {
  constructor(
    readonly reason: ProviderErrorCause,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
