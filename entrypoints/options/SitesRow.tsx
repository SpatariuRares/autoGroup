import { useState } from 'react';
import { normalizeSite, type CategorySites } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import type { Category } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';

interface SitesRowProps {
  category: Category;
  /** All the categories: needed to tell which one a site is already in. */
  categories: Category[];
  sites: CategorySites;
  /** Saves all the sites; returns false if they were rejected. */
  onChange: (sites: CategorySites) => Promise<boolean>;
}

/** "Sites" row of a category: the tabs of these sites always go there, without asking the AI. */
export function SitesRow({ category, categories, sites, onChange }: SitesRowProps) {
  // null = field closed: a category without sites only shows "+ Site".
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; arg?: string } | null>(null);
  const own = sites[category.id] ?? [];

  function close() {
    setDraft(null);
    setError(null);
  }

  async function add() {
    const site = normalizeSite(draft ?? '');
    if (!site) return setError({ key: 'optionsSiteInvalid' });
    const owner = categories.find((c) => sites[c.id]?.includes(site));
    if (owner) return setError({ key: 'optionsSiteDuplicate', arg: owner.name });
    // If the save is rejected (e.g. too many sites), the error goes under the field, not only in the banner.
    if (await onChange({ ...sites, [category.id]: [...own, site] })) close();
    else setError({ key: 'optionsSitesTooMany' });
  }

  return (
    <div className="category-sites">
      {own.length > 0 && (
        <ul className="domains" aria-label={`${t('optionsSites')}: ${category.name}`}>
          {own.map((site) => (
            <li key={site} className="chip">
              <span>{site}</span>
              <button
                className="icon danger"
                data-tooltip={t('optionsRemove')}
                aria-label={`${t('optionsRemove')}: ${site}`}
                onClick={() => onChange({ ...sites, [category.id]: own.filter((s) => s !== site) })}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft === null ? (
        <button
          className="text small"
          title={t('optionsSitesHint')}
          aria-label={`${t('optionsAddSite')}: ${category.name}`}
          onClick={() => setDraft('')}>
          <Icon name="add" size={18} />
          {t('optionsAddSite')}
        </button>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            type="text"
            autoFocus
            value={draft}
            placeholder={t('optionsSitePlaceholder')}
            aria-label={`${t('optionsSites')}: ${category.name}`}
            aria-invalid={error !== null}
            aria-describedby={error ? `sites-error-${category.id}` : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Escape' && close()}
          />
          <button type="submit" className="tonal">
            {t('optionsAdd')}
          </button>
        </form>
      )}
      {error && (
        <p id={`sites-error-${category.id}`} className="hint error" role="alert">
          {t(error.key, error.arg)}
        </p>
      )}
    </div>
  );
}
