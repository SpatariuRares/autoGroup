import { postJson, TIMINGS } from './http';
import { ProviderError, type AiOption, type AiTab, type Classification, type Classifier } from './types';

/** Maximum options per "choice" question in the System One protocol. */
const MAX_CHOICE_OPTIONS = 255;
/** Option added to the categories, as TypeSafe recommends: the tab fits none of them. */
const NONE_OPTION = 'none_of_the_above';
const NONE_DESCRIPTION = 'The tab fits none of the other options.';
const INSTRUCTIONS = 'Which group should this browser tab go into';

export type ClassifierStrategy = 'per-tab' | 'batch';

export interface SystemOneConfig {
  label: string;
  baseUrl: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  /**
   * "per-tab": one request per tab (state = the tab), with at most `concurrency` requests at once.
   * "batch": a single request with one question per tab (state = all the tabs).
   */
  strategy?: ClassifierStrategy;
  concurrency?: number;
}

interface ChoiceAnswer {
  type?: string;
  choice?: unknown;
  confidence?: unknown;
}

/** criteria: name → description of each option, plus "none of the above". */
export function buildCriteria(options: AiOption[]): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const option of options.slice(0, MAX_CHOICE_OPTIONS - 1)) {
    criteria[option.name] = option.description || option.name;
  }
  criteria[NONE_OPTION] = NONE_DESCRIPTION;
  return criteria;
}

const tabState = (tab: AiTab) => ({ title: tab.title, url: tab.url, ...(tab.description ? { description: tab.description } : {}) });

/**
 * Classifier on the System One protocol (`POST {baseUrl}/v1/systemone`): Jev, Kev, Rizzo Flow.
 * Each tab receives a "choice" question with the known options as criteria.
 */
export function createSystemOneClassifier(config: SystemOneConfig): Classifier {
  async function call(body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, ChoiceAnswer>> {
    const json = (await postJson(
      `${config.baseUrl}/v1/systemone`,
      { ...(config.model ? { model: config.model } : {}), ...body },
      { apiKey: config.apiKey, timeoutMs: config.timeoutMs ?? TIMINGS.classifier, signal },
    )) as { answers?: unknown };
    if (typeof json?.answers !== 'object' || json.answers === null) {
      throw new ProviderError('invalid-response', 'risposta senza answers');
    }
    return json.answers as Record<string, ChoiceAnswer>;
  }

  /** An unreadable answer for a tab leaves it "left over", without making the others fail. */
  function read(answer: ChoiceAnswer | undefined, criteria: Record<string, string>): Classification {
    const choice = typeof answer?.choice === 'string' && answer.choice in criteria && answer.choice !== NONE_OPTION ? answer.choice : null;
    const confidence = typeof answer?.confidence === 'number' ? answer.confidence : 0;
    return { choice, confidence };
  }

  return {
    label: config.label,

    async classify(tabs, options, signal) {
      const criteria = buildCriteria(options);
      const result = new Map<string, Classification>();
      const question = { type: 'choice', instructions: INSTRUCTIONS, criteria };

      if (config.strategy === 'batch') {
        const questions = Object.fromEntries(
          tabs.map((tab) => [tab.id, { ...question, instructions: `${INSTRUCTIONS}: the tab with id "${tab.id}"` }]),
        );
        const state = tabs.map((tab) => ({ id: tab.id, ...tabState(tab) }));
        const answers = await call({ state, questions }, signal);
        for (const tab of tabs) result.set(tab.id, read(answers[tab.id], criteria));
        return result;
      }

      // On the first error the pipeline falls back a level: the requests still in progress are no longer needed.
      const stop = new AbortController();
      const shared = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
      try {
        await mapWithLimit(tabs, config.concurrency ?? 4, async (tab) => {
          const answers = await call({ state: tabState(tab), questions: { group: question } }, shared);
          result.set(tab.id, read(answers.group, criteria));
        });
      } finally {
        stop.abort();
      }
      return result;
    },
  };
}

/** Runs `task` on each item with at most `limit` executions at once; stops at the first error. */
async function mapWithLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      try {
        await task(items[next++]!);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  });
  await Promise.all(workers);
}

/** "Test connection": a minimal question that checks the URL, key and model. */
export async function testSystemOneConnection(config: SystemOneConfig): Promise<void> {
  const classifier = createSystemOneClassifier({ ...config, strategy: 'per-tab' });
  await classifier.classify([{ id: 't1', title: 'Example', url: 'example.com' }], [{ name: 'test', description: 'Test option' }]);
}
