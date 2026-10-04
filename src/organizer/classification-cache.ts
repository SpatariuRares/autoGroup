import type { AiTab, Classification, Classifier } from '../ai/types';
import { createSessionCache, digest } from './session-cache';

/** Risposte ricordate: abbastanza per molte finestre piene di tab. */
const MAX_ENTRIES = 1000;

const cache = createSessionCache<Classification>('classifierCache', MAX_ENTRIES);

/**
 * Classificatore con cache per tab: chiede al server solo le tab che non ha mai visto con le stesse
 * opzioni, così aprire una tab costa una richiesta sola invece di riclassificare tutta la finestra.
 *
 * La chiave è l'impronta di server, modello, opzioni (nomi e descrizioni), titolo, URL ripulito e
 * descrizione della tab: cambiare una categoria, il modello o la pagina non riusa le vecchie risposte.
 * La soglia resta fuori perché si applica dopo, quindi cambiarla non costa nessuna richiesta.
 * Le risposte illeggibili (confidenza 0) non vengono ricordate, così al calcolo dopo si riprova.
 * Il Classificatore risponde sempre allo stesso modo, quindi la cache vale anche per "Ricalcola".
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
      // Riscrive anche le risposte già note: restano le più recenti e non escono per prime.
      if (missing.length > 0) await cache.setMany(remember);
      return result;
    },
  };
}
