import type { IconName } from '../../src/ui/Icon';

/**
 * Le pagine delle impostazioni, una alla volta, nell'ordine del menu. `sections` sono gli `id` delle
 * schede della pagina, nell'ordine in cui compaiono: un indirizzo come options.html#generator (dagli
 * avvisi del pannello) apre la pagina che contiene quella scheda e ci scorre.
 */
export const VIEWS = [
  { id: 'general', title: 'optionsNavGeneral', icon: 'tune', sections: ['mode', 'tabs', 'backup'] },
  { id: 'categories', title: 'optionsNavCategories', icon: 'category', sections: ['categories', 'autogroup'] },
  { id: 'ai', title: 'optionsNavAi', icon: 'smartToy', sections: ['generator', 'descriptions', 'classifier'] },
  { id: 'about', title: 'optionsNavAbout', icon: 'info', sections: ['about-card', 'about-privacy', 'about-support'] },
] as const satisfies readonly { id: string; title: string; icon: IconName; sections: readonly string[] }[];

export type ViewId = (typeof VIEWS)[number]['id'];

/** I nomi delle sezioni della vecchia pagina unica, che non esistono più: portano dove sono finite. */
const LEGACY_SECTIONS: Record<string, ViewId> = { behavior: 'general', privacy: 'general' };

const SECTION_VIEW: Record<string, ViewId> = {
  ...LEGACY_SECTIONS,
  ...Object.fromEntries(VIEWS.flatMap((v) => v.sections.map((section) => [section, v.id]))),
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
