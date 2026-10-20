import { useEffect, useState } from 'react';
import { loadDescribing, onDescribingChange } from '../shared/describing';

/** Le categorie di cui l'AI sta scrivendo la descrizione, dal vivo (vedi `src/shared/describing.ts`). */
export function useDescribing(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadDescribing().then((list) => setIds(new Set(list)));
    return onDescribingChange((list) => setIds(new Set(list)));
  }, []);
  return ids;
}
