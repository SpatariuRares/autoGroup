import { resetCategories } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { useDescribing } from '../../src/ui/use-describing';
import { AutoGroupSection, CategoriesSection } from './CategoriesSection';
import type { PageProps } from './use-save';

/** Categories: the list, with each one's sites, and the automatic grouping that uses them. */
export function CategoriesView({ settings, saving: { save, update, offerUndo } }: PageProps) {
  const describing = useDescribing();
  // Categories and sites together: deleting a category, the save also removes its sites.
  const before = { categories: settings.categories, categorySites: settings.categorySites };
  return (
    <>
      <CategoriesSection
        categories={settings.categories}
        describing={describing}
        sites={settings.categorySites}
        onChange={(categories) => update({ categories })}
        onSitesChange={(categorySites) => update({ categorySites })}
        onReset={() => save(resetCategories, { undo: () => ({ text: t('optionsCategoriesReset'), before }) })}
        onDeleted={(category) => offerUndo({ text: t('optionsCategoryDeleted', category.name), before })}
      />
      <AutoGroupSection enabled={settings.autoGroupSites} onChange={(autoGroupSites) => update({ autoGroupSites })} />
    </>
  );
}
