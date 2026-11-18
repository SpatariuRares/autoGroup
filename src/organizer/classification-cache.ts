import type { AiTab, Classification, Classifier } from '../ai/types';
import { createSessionCache, digest } from './session-cache';

/** Remembered answers: enough for many windows full of tabs. */
const MAX_ENTRIES = 1000;

const cache = createSessionCache<Classification>('classifierCache', MAX_ENTRIES);

/**
 * Classifier with a cache per tab: it asks the server only for the tabs it has never seen with the same
 * options, so opening a tab costs a single request instead of reclassifying the whole window.
 *
 * The key is the digest of server, model, options (names and descriptions), title, cleaned URL and
 * description of the tab: changing a category, the model or the page does not reuse the old answers.
 * The threshold stays out because it is applied afterwards, so changing it costs no request.
 * Unreadable answers (confidence 0) are not remembered, so the next computation retries them.
 * The Classifier always answers the same way, so the cache also applies to "Recompute".
 */
export function withClassificationCache(classifier: Classifier, provider: { baseUrl: string; model: string }): Classifier {
  return {
    label: classifier.label,

    async classify(tabs, options, signal) {
      const context = await digest([provider.baseUrl, provider.model, options]);
      const keys = await Promise.all(tabs.map((tab) => digest([context, tab.title, tab.url, tab.description ?? ''])));
      const cached = await cache.getMany(keys);
      const missing: AiTab[] = tabs.filter((_, i) => !cached.has(keys[i]!));
      const fresh = missing.length > 0 ? await classifier.classify(missing, options, signal) : new Map<string, Classification>();

      const result = new Map<string, Classification>();
      const remember = new Map<string, Classification>();
      tabs.forEach((tab, i) => {
        const answer = cached.get(keys[i]!) ?? fresh.get(tab.id);
        if (!answer) return;
        result.set(tab.id, answer);
        if (answer.confidence > 0) remember.set(keys[i]!, answer);
      });
      // Also rewrites the answers already known: they stay the most recent and are not evicted first.
      if (missing.length > 0) await cache.setMany(remember);
      return result;
    },
  };
}
