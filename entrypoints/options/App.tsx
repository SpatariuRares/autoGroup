import { useEffect, useRef, useState } from 'react';
import { t } from '../../src/shared/i18n';
import {
  categoryKey,
  isValidMinTabs,
  loadSettings,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  newCategoryId,
  normalizeDomain,
  resetCategories,
  saveSettings,
  SettingsError,
  validateCategories,
  type Settings,
} from '../../src/settings';
import { GROUP_COLORS, type Category } from '../../src/shared/types';
import { NanoStatus } from './NanoStatus';
import { ProviderSection } from './ProviderSection';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const [saveError, setSaveError] = useState<string | null>(null);

  function confirmSaved() {
    setSaveError(null);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  }

  async function update(patch: Partial<Settings>) {
    try {
      await saveSettings(patch);
    } catch (err) {
      console.error('autoGroup:', err);
      setSaveError(err instanceof SettingsError ? err.messageKey : 'errorSaveSettings');
      return false;
    }
    setSettings((current) => (current ? { ...current, ...patch } : current));
    confirmSaved();
    return true;
  }

  if (!settings) return null;

  return (
    <main>
      <header>
        <h1>{t('optionsTitle')}</h1>
        <span className="saved" role="status">
          {saved ? t('optionsSaved') : ''}
        </span>
      </header>
      {saveError && (
        <p className="notice error" role="alert">
          {t(saveError)}
        </p>
      )}
      <CategoriesSection
        categories={settings.categories}
        onChange={(categories) => update({ categories })}
        onReset={async () => {
          const categories = await resetCategories();
          setSettings((current) => (current ? { ...current, categories } : current));
          confirmSaved();
        }}
      />
      <ProviderSection
        role="classifier"
        saved={settings.classifier}
        onSaved={(classifier) => {
          setSettings((current) => (current ? { ...current, classifier } : current));
          confirmSaved();
        }}
        extra={<ThresholdField threshold={settings.threshold} onChange={(threshold) => update({ threshold })} />}
      />
      <ProviderSection
        role="generator"
        saved={settings.generator}
        whenNone={<NanoStatus />}
        onSaved={(generator) => {
          setSettings((current) => (current ? { ...current, generator } : current));
          confirmSaved();
        }}
      />
      <BehaviorSection minTabs={settings.minTabs} onChange={(minTabs) => update({ minTabs })} />
      <PrivacySection
        excludedDomains={settings.excludedDomains}
        onChange={(excludedDomains) => update({ excludedDomains })}
      />
    </main>
  );
}

interface CategoriesSectionProps {
  categories: Category[];
  /** Salva la lista; restituisce false se è stata rifiutata. */
  onChange: (categories: Category[]) => Promise<boolean>;
  onReset: () => Promise<void>;
}

function CategoriesSection({ categories, onChange, onReset }: CategoriesSectionProps) {
  // Bozza locale: un nome duplicato resta visibile (con l'errore) finché l'utente non lo corregge.
  const [draft, setDraft] = useState(categories);
  const [invalid, setInvalid] = useState<string | null>(null);
  useEffect(() => setDraft(categories), [categories]);

  async function commit(next: Category[]) {
    setDraft(next);
    const error = validateCategories(next);
    setInvalid(error);
    if (!error) await onChange(next);
  }

  const update = (id: string, patch: Partial<Category>) => draft.map((c) => (c.id === id ? { ...c, ...patch } : c));

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
    commit([...draft, { id: newCategoryId(), name, description: '', color }]);
  }

  return (
    <section id="categories">
      <h2>{t('optionsCategories')}</h2>
      <p className="hint">{t('optionsCategoriesHint')}</p>
      {invalid && (
        <p className="hint error" role="alert">
          {t(invalid)}
        </p>
      )}
      {draft.length === 0 && <p className="empty">{t('optionsNoCategories')}</p>}
      <ol className="categories">
        {draft.map((category, index) => (
          <li key={category.id} className="category">
            <div className="category-main">
              <input
                type="text"
                className="category-name"
                value={category.name}
                maxLength={MAX_NAME_LENGTH}
                aria-label={t('optionsCategoryName')}
                placeholder={t('optionsCategoryName')}
                onChange={(e) => setDraft(update(category.id, { name: e.target.value }))}
                onBlur={() => commit(draft)}
              />
              <textarea
                className="category-description"
                value={category.description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                rows={2}
                aria-label={t('optionsCategoryDescription')}
                placeholder={t('optionsCategoryDescription')}
                onChange={(e) => setDraft(update(category.id, { description: e.target.value }))}
                onBlur={() => commit(draft)}
              />
              <div className="palette" role="radiogroup" aria-label={t('optionsCategoryColor')}>
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    role="radio"
                    aria-checked={color === category.color}
                    className={`swatch color-${color}${color === category.color ? ' selected' : ''}`}
                    title={t(`color_${color}`)}
                    aria-label={t(`color_${color}`)}
                    onClick={() => commit(update(category.id, { color }))}
                  />
                ))}
              </div>
            </div>
            <div className="category-actions">
              <button className="icon" title={t('optionsMoveUp')} aria-label={t('optionsMoveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button
                className="icon"
                title={t('optionsMoveDown')}
                aria-label={t('optionsMoveDown')}
                disabled={index === draft.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                className="icon"
                title={t('optionsDeleteCategory')}
                aria-label={t('optionsDeleteCategory')}
                onClick={() => commit(draft.filter((c) => c.id !== category.id))}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row actions">
        <button onClick={add}>{t('optionsAddCategory')}</button>
        <button
          className="secondary"
          onClick={async () => {
            setInvalid(null);
            await onReset();
          }}
        >
          {t('optionsResetCategories')}
        </button>
      </div>
    </section>
  );
}

/** Soglia di confidenza del Classificatore, da 0 a 1, mostrata in percentuale. */
function ThresholdField({ threshold, onChange }: { threshold: number; onChange: (value: number) => unknown }) {
  const [value, setValue] = useState(threshold);
  return (
    <>
      <label className="field threshold">
        <span>{t('optionsThreshold')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={() => value !== threshold && onChange(value)}
          onKeyUp={() => value !== threshold && onChange(value)}
        />
        <output>{Math.round(value * 100)}%</output>
      </label>
      <p className="hint">{t('optionsThresholdHint')}</p>
    </>
  );
}

function BehaviorSection({ minTabs, onChange }: { minTabs: number; onChange: (value: number) => unknown }) {
  const [value, setValue] = useState(String(minTabs));
  const parsed = Number(value);
  const valid = value.trim() !== '' && isValidMinTabs(parsed);

  return (
    <section id="behavior">
      <h2>{t('optionsBehavior')}</h2>
      <label className="field">
        <span>{t('optionsMinTabs')}</span>
        <input
          type="number"
          min={1}
          step={1}
          value={value}
          aria-invalid={!valid}
          onChange={(e) => {
            setValue(e.target.value);
            const next = Number(e.target.value);
            if (e.target.value.trim() !== '' && isValidMinTabs(next) && next !== minTabs) onChange(next);
          }}
        />
      </label>
      <p className={valid ? 'hint' : 'hint error'}>{valid ? t('optionsMinTabsHint') : t('optionsMinTabsInvalid')}</p>
    </section>
  );
}

function PrivacySection({ excludedDomains, onChange }: { excludedDomains: string[]; onChange: (value: string[]) => unknown }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add() {
    const domain = normalizeDomain(draft);
    if (!domain) return setError('optionsDomainInvalid');
    if (excludedDomains.includes(domain)) return setError('optionsDomainDuplicate');
    setError(null);
    setDraft('');
    onChange([...excludedDomains, domain].sort());
  }

  return (
    <section id="privacy">
      <h2>{t('optionsPrivacy')}</h2>
      <h3>{t('optionsExcludedDomains')}</h3>
      <p className="hint">{t('optionsExcludedDomainsHint')}</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          value={draft}
          placeholder={t('optionsDomainPlaceholder')}
          aria-label={t('optionsExcludedDomains')}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
        />
        <button type="submit">{t('optionsAdd')}</button>
      </form>
      {error && <p className="hint error">{t(error)}</p>}
      {excludedDomains.length === 0 ? (
        <p className="empty">{t('optionsNoExcludedDomains')}</p>
      ) : (
        <ul className="domains">
          {excludedDomains.map((domain) => (
            <li key={domain}>
              <span>{domain}</span>
              <button
                className="icon"
                title={t('optionsRemove')}
                aria-label={`${t('optionsRemove')}: ${domain}`}
                onClick={() => onChange(excludedDomains.filter((d) => d !== domain))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
