import { useEffect, useRef, useState } from 'react';
import {
  categoryKey,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  newCategoryId,
  validateCategories,
  type CategorySites,
} from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { GROUP_COLORS, type Category, type GroupColor } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { Card } from './Card';
import { SitesRow } from './SitesRow';

/** Quanti siti si vedono nella riga chiusa di una categoria; gli altri diventano "+N". */
const VISIBLE_SITES = 2;

interface CategoriesSectionProps {
  categories: Category[];
  /** Salva la lista; restituisce false se è stata rifiutata. */
  onChange: (categories: Category[]) => Promise<boolean>;
  sites: CategorySites;
  /** Salva i siti di tutte le categorie; restituisce false se sono stati rifiutati. */
  onSitesChange: (sites: CategorySites) => Promise<boolean>;
  onReset: () => Promise<void>;
  /** Una categoria è stata eliminata e salvata: la pagina offre di annullare. */
  onDeleted: (category: Category) => void;
}

/**
 * Elenco delle categorie in righe compatte (colore, nome, siti o descrizione): un clic apre la riga
 * per modificare nome, descrizione, siti, ordine ed eliminazione.
 */
export function CategoriesSection({ categories, sites, onChange, onSitesChange, onReset, onDeleted }: CategoriesSectionProps) {
  // Bozza locale: un nome duplicato resta visibile (con l'errore) finché l'utente non lo corregge.
  const [draft, setDraft] = useState(categories);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => setDraft(categories), [categories]);

  /** Salva la bozza se è valida; restituisce true se è stata salvata. */
  async function commit(next: Category[]): Promise<boolean> {
    setDraft(next);
    const error = validateCategories(next);
    setInvalid(error);
    return error === null && (await onChange(next));
  }

  const update = (id: string, patch: Partial<Category>) => draft.map((c) => (c.id === id ? { ...c, ...patch } : c));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function move(index: number, delta: number) {
    const next = [...draft];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    commit(next);
  }

  function add() {
    const base = t('optionsNewCategoryName');
    const taken = new Set(draft.map((c) => categoryKey(c.name)));
    let name = base;
    for (let n = 2; taken.has(categoryKey(name)); n++) name = `${base} ${n}`;
    const used = new Set(draft.map((c) => c.color));
    const color = GROUP_COLORS.find((c) => !used.has(c)) ?? 'grey';
    const id = newCategoryId();
    // La categoria nuova si apre subito, per darle nome e descrizione.
    setOpen((current) => new Set(current).add(id));
    commit([...draft, { id, name, description: '', color }]);
  }

  return (
    <Card
      id="categories"
      title={t('optionsCategories')}
      hint={t('optionsCategoriesHint')}
      aside={<span className="count-badge">{draft.length}</span>}
    >
      {invalid && (
        <p className="hint error" role="alert">
          {t(invalid)}
        </p>
      )}
      {draft.length === 0 && <p className="empty">{t('optionsNoCategories')}</p>}
      <ol className="categories">
        {draft.map((category, index) => {
          const expanded = open.has(category.id);
          const own = sites[category.id] ?? [];
          return (
            <li key={category.id} className={`category${expanded ? ' open' : ''}`} data-category={category.id}>
              <div className="category-summary">
                <ColorPicker color={category.color} onChange={(color) => commit(update(category.id, { color }))} />
                <button
                  className="category-toggle"
                  aria-expanded={expanded}
                  onClick={() => toggle(category.id)}
                >
                  <span className="category-title">{category.name || t('optionsCategoryName')}</span>
                  {!expanded &&
                    (own.length > 0 ? (
                      <span className="category-chips">
                        {own.slice(0, VISIBLE_SITES).map((site) => (
                          <span key={site} className="site-chip">
                            {site}
                          </span>
                        ))}
                        {own.length > VISIBLE_SITES && <span className="site-chip more">{t('optionsMoreSites', String(own.length - VISIBLE_SITES))}</span>}
                      </span>
                    ) : (
                      <span className="category-preview">{category.description}</span>
                    ))}
                  <Icon name="chevronRight" size={20} />
                </button>
              </div>
              {expanded && (
                <div className="category-editor">
                  <label className="field">
                    <span className="field-label">{t('optionsCategoryName')}</span>
                    <input
                      type="text"
                      className="category-name"
                      value={category.name}
                      maxLength={MAX_NAME_LENGTH}
                      onChange={(e) => setDraft(update(category.id, { name: e.target.value }))}
                      onBlur={() => commit(draft)}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">{t('optionsCategoryDescription')}</span>
                    <textarea
                      className="category-description"
                      value={category.description}
                      maxLength={MAX_DESCRIPTION_LENGTH}
                      rows={2}
                      onChange={(e) => setDraft(update(category.id, { description: e.target.value }))}
                      onBlur={() => commit(draft)}
                    />
                  </label>
                  <div className="field">
                    <span className="field-label">{t('optionsSites')}</span>
                    <p className="hint">{t('optionsSitesHint')}</p>
                    <SitesRow category={category} categories={draft} sites={sites} onChange={onSitesChange} />
                  </div>
                  <div className="category-actions">
                    <button className="icon small" title={t('optionsMoveUp')} aria-label={t('optionsMoveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                      <Icon name="arrowUpward" size={18} />
                    </button>
                    <button
                      className="icon small"
                      title={t('optionsMoveDown')}
                      aria-label={t('optionsMoveDown')}
                      disabled={index === draft.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <Icon name="arrowDownward" size={18} />
                    </button>
                    <span className="spacer" />
                    <button
                      className="text small danger delete-category"
                      onClick={async () => (await commit(draft.filter((c) => c.id !== category.id))) && onDeleted(category)}
                    >
                      <Icon name="delete" size={18} />
                      {t('optionsDeleteCategory')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="actions">
        <button className="tonal" onClick={add}>
          <Icon name="add" size={18} />
          {t('optionsAddCategory')}
        </button>
        <button
          className="secondary"
          onClick={async () => {
            setInvalid(null);
            setOpen(new Set());
            await onReset();
          }}
        >
          {t('optionsResetCategories')}
        </button>
      </div>
    </Card>
  );
}

/** Raggruppamento automatico: vale solo per i siti delle categorie, quindi sta nella stessa pagina. */
export function AutoGroupSection({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => unknown }) {
  return (
    <Card id="autogroup" title={t('optionsAutoGroup')}>
      <label className="toggle">
        <span className="setting-text">
          <strong>{t('optionsAutoGroupSites')}</strong>
          <span className="hint">{t('optionsAutoGroupSitesHint')}</span>
        </span>
        <input type="checkbox" role="switch" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      </label>
    </Card>
  );
}

/** Pallino del colore che apre la tavolozza dei 9 colori di Chrome. */
function ColorPicker({ color, onChange }: { color: GroupColor; onChange: (color: GroupColor) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="color-picker" ref={ref}>
      <button
        className={`swatch color-${color}`}
        title={`${t('optionsCategoryColor')}: ${t(`color_${color}`)}`}
        aria-label={`${t('optionsCategoryColor')}: ${t(`color_${color}`)}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="palette popover" role="radiogroup" aria-label={t('optionsCategoryColor')}>
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={c === color}
              className={`swatch color-${c}${c === color ? ' selected' : ''}`}
              title={t(`color_${c}`)}
              aria-label={t(`color_${c}`)}
              onClick={() => {
                setOpen(false);
                if (c !== color) onChange(c);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
