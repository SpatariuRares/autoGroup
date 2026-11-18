import type { IconName } from '../../src/ui/Icon';

/**
 * The settings pages, one at a time, in the order of the menu. `sections` are the `id`s of the
 * cards of the page, in the order they appear: an address such as options.html#generator (from the
 * panel's notices) opens the page that contains that card and scrolls to it.
 */
export const VIEWS = [
  { id: 'general', title: 'optionsNavGeneral', icon: 'tune', sections: ['mode', 'tabs', 'backup'] },
  { id: 'categories', title: 'optionsNavCategories', icon: 'category', sections: ['categories', 'autogroup'] },
  { id: 'ai', title: 'optionsNavAi', icon: 'smartToy', sections: ['generator', 'descriptions', 'classifier'] },
  { id: 'about', title: 'optionsNavAbout', icon: 'info', sections: ['about-card', 'about-privacy', 'about-support'] },
] as const satisfies readonly { id: string; title: string; icon: IconName; sections: readonly string[] }[];

export type ViewId = (typeof VIEWS)[number]['id'];

/** The names of the sections of the old single page, which no longer exist: they lead to where they went. */
const LEGACY_SECTIONS: Record<string, ViewId> = { behavior: 'general', privacy: 'general' };

const SECTION_VIEW: Record<string, ViewId> = {
  ...LEGACY_SECTIONS,
  ...Object.fromEntries(VIEWS.flatMap((v) => v.sections.map((section) => [section, v.id]))),
};

/**
 * From `location.hash` to the page to show and, if the address names a section, the section to scroll
 * to. An unknown or empty address opens the first page.
 */
export function resolveHash(hash: string): { view: ViewId; section?: string } {
  const id = hash.replace(/^#/, '');
  if (VIEWS.some((v) => v.id === id)) return { view: id as ViewId };
  const view = SECTION_VIEW[id];
  return view ? { view, section: id } : { view: 'general' };
}
