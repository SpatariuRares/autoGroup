import { postJson } from './http';
import { ProviderError, type AiOption, type AiTab, type Classification, type Classifier } from './types';

/** Massimo di opzioni per domanda "choice" nel protocollo System One. */
export const MAX_CHOICE_OPTIONS = 255;
/** Opzione aggiunta alle categorie, come consiglia TypeSafe: la tab non rientra in nessuna. */
export const NONE_OPTION = 'none_of_the_above';
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
   * "per-tab": una richiesta per tab (state = la tab), con al massimo `concurrency` richieste insieme.
   * "batch": una sola richiesta con una domanda per tab (state = tutte le tab).
   */
  strategy?: ClassifierStrategy;
  concurrency?: number;
}

interface ChoiceAnswer {
  type?: string;
  choice?: unknown;
  confidence?: unknown;
}

/** criteria: nome → descrizione di ogni opzione, più "nessuna delle precedenti". */
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
 * Classificatore sul protocollo System One (`POST {baseUrl}/v1/systemone`): Jev, Kev, Rizzo Flow.
 * Ogni tab riceve una domanda "choice" con le opzioni note come criteria.
 */
export function createSystemOneClassifier(config: SystemOneConfig): Classifier {
  async function call(body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, ChoiceAnswer>> {
    const json = (await postJson(
      `${config.baseUrl}/v1/systemone`,
      { ...(config.model ? { model: config.model } : {}), ...body },
      { apiKey: config.apiKey, timeoutMs: config.timeoutMs ?? 5_000, signal },
    )) as { answers?: unknown };
    if (typeof json?.answers !== 'object' || json.answers === null) {
      throw new ProviderError('invalid-response', 'risposta senza answers');
    }
    return json.answers as Record<string, ChoiceAnswer>;
  }

  /** Una risposta illeggibile per una tab la lascia "rimasta", senza far fallire le altre. */
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

      await mapWithLimit(tabs, config.concurrency ?? 4, async (tab) => {
        const answers = await call({ state: tabState(tab), questions: { group: question } }, signal);
        result.set(tab.id, read(answers.group, criteria));
      });
      return result;
    },
  };
}

/** Esegue `task` su ogni elemento con al massimo `limit` esecuzioni insieme; al primo errore si ferma. */
async function mapWithLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++]!);
  });
  await Promise.all(workers);
}

/** "Prova connessione": una domanda minima che verifica URL, chiave e modello. */
export async function testSystemOneConnection(config: SystemOneConfig): Promise<void> {
  const classifier = createSystemOneClassifier({ ...config, strategy: 'per-tab' });
  await classifier.classify([{ id: 't1', title: 'Example', url: 'example.com' }], [{ name: 'test', description: 'Test option' }]);
}
