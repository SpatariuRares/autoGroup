import type { IconName } from '../../src/ui/Icon';

/** Le pagine delle impostazioni, una alla volta, nell'ordine del menu. */
export type ViewId = 'general' | 'categories' | 'ai' | 'about';

export const VIEWS: { id: ViewId; title: string; icon: IconName }[] = [
  { id: 'general', title: 'optionsNavGeneral', icon: 'tune' },
  { id: 'categories', title: 'optionsNavCategories', icon: 'category' },
  { id: 'ai', title: 'optionsNavAi', icon: 'smartToy' },
  { id: 'about', title: 'optionsNavAbout', icon: 'info' },
];

/**
 * Le sezioni che si possono aprire con un indirizzo (es. options.html#generator dagli avvisi del
 * pannello) e la pagina che le contiene. Ci sono anche i nomi delle sezioni della vecchia pagina unica.
 */
const SECTION_VIEW: Record<string, ViewId> = {
  mode: 'general',
  tabs: 'general',
  behavior: 'general',
  privacy: 'general',
  autogroup: 'categories',
  generator: 'ai',
  classifier: 'ai',
  descriptions: 'ai',
};

/**
 * Da `location.hash` alla pagina da mostrare e, se l'indirizzo nomina una sezione, la sezione su cui
 * scorrere. Un indirizzo sconosciuto o vuoto apre la prima pagina.
 */
export function resolveHash(hash: string): { view: ViewId; section?: string } {
  const id = hash.replace(/^#/, '');
  if (VIEWS.some((v) => v.id === id)) return { view: id as ViewId };
  const view = SECTION_VIEW[id];
  return view ? { view, section: id } : { view: 'general' };
}
