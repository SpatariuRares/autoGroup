import { useEffect, useRef, useState } from 'react';
import { t } from '../../src/shared/i18n';
import { browser } from 'wxt/browser';
import {
  ALL_URLS,
  categoryKey,
  hasDescriptionPermission,
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
import { GROUP_COLORS, type Category, type GroupColor } from '../../src/shared/types';
import { Icon } from '../../src/ui/Icon';
import { Card } from './Card';
import { ModeSection } from './ModeSection';
import { NanoStatus } from './NanoStatus';
import { ProviderSection } from './ProviderSection';
import { ThresholdField } from './ThresholdField';

/** Pagina Buy Me a Coffee dell'autore. */
const COFFEE_URL = 'https://www.buymeacoffee.com/SpatariuRares';

/** Sezioni nell'ordine della pagina; quelle `ai` si vedono solo in modalità AI. */
const SECTIONS: { id: string; title: string; ai?: boolean }[] = [
  { id: 'mode', title: 'optionsMode' },
  { id: 'categories', title: 'optionsCategories', ai: true },
  { id: 'classifier', title: 'optionsClassifier', ai: true },
  { id: 'generator', title: 'optionsGenerator', ai: true },
  { id: 'behavior', title: 'optionsBehavior' },
  { id: 'privacy', title: 'optionsPrivacy' },
];

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Il pannello può aprire una sezione precisa (es. options.html#generator): si scorre quando la pagina è pronta.
  useEffect(() => {
    if (settings && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [settings === null]);

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
  const ai = settings.mode === 'ai';

  return (
    <div className="layout">
      <nav className="sidebar" aria-label={t('optionsTitle')}>
        <div className="brand">
          <img src="/icon/32.png" alt="" width={24} height={24} />
          <span>autoGroup</span>
        </div>
        <ul>
          {SECTIONS.filter((s) => ai || !s.ai).map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{t(s.title)}</a>
            </li>
          ))}
        </ul>
        <a className="guide-link" href="/onboarding.html" target="_blank">
          {t('optionsOnboarding')}
        </a>
        {/* Pulsante locale nello stile di Buy Me a Coffee: l'immagine ufficiale verrebbe scaricata dal loro sito a ogni apertura. */}
        <a className="coffee" href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
          <span aria-hidden="true">✈️</span>
          {t('optionsCoffee')}
        </a>
      </nav>
      <main>
        <header className="page-header">
          <h1>{t('optionsTitle')}</h1>
          <span className={`saved${saved ? ' visible' : ''}`} role="status">
            {saved && (
              <>
                <Icon name="check" size={18} />
                {t('optionsSaved')}
              </>
            )}
          </span>
        </header>
        {saveError && (
          <p className="banner error" role="alert">
            {t(saveError)}
          </p>
        )}

        <ModeSection mode={settings.mode} onChange={(mode) => update({ mode })} />

        {ai ? (
          <>
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
              nano={<NanoStatus />}
              onSaved={(generator) => {
                setSettings((current) => (current ? { ...current, generator } : current));
                confirmSaved();
              }}
            />
          </>
        ) : (
          <p className="banner">{t('optionsModeDomainNote')}</p>
        )}

        <BehaviorSection minTabs={settings.minTabs} onChange={(minTabs) => update({ minTabs })} />
        <PrivacySection
          ai={ai}
          readDescriptions={settings.readDescriptions}
          onReadDescriptions={(readDescriptions) => update({ readDescriptions })}
          excludedDomains={settings.excludedDomains}
          onChange={(excludedDomains) => update({ excludedDomains })}
        />
      </main>
    </div>
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
        {draft.map((category, index) => (
          <li key={category.id} className="category">
            <ColorPicker color={category.color} onChange={(color) => commit(update(category.id, { color }))} />
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
              rows={1}
              aria-label={t('optionsCategoryDescription')}
              placeholder={t('optionsCategoryDescription')}
              onChange={(e) => setDraft(update(category.id, { description: e.target.value }))}
              onBlur={() => commit(draft)}
            />
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
              <button
                className="icon small danger"
                title={t('optionsDeleteCategory')}
                aria-label={t('optionsDeleteCategory')}
                onClick={() => commit(draft.filter((c) => c.id !== category.id))}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </li>
        ))}
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
            await onReset();
          }}
        >
          {t('optionsResetCategories')}
        </button>
      </div>
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

function BehaviorSection({ minTabs, onChange }: { minTabs: number; onChange: (value: number) => unknown }) {
  const [value, setValue] = useState(String(minTabs));
  const parsed = Number(value);
  const valid = value.trim() !== '' && isValidMinTabs(parsed);

  return (
    <Card id="behavior" title={t('optionsBehavior')}>
      <div className="form-row">
        <label className="form-label" htmlFor="min-tabs">
          {t('optionsMinTabs')}
        </label>
        <div className="form-control">
          <input
            id="min-tabs"
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
          <p className={valid ? 'hint' : 'hint error'}>{valid ? t('optionsMinTabsHint') : t('optionsMinTabsInvalid')}</p>
        </div>
      </div>
    </Card>
  );
}

interface PrivacySectionProps {
  /** In modalità "solo dominio" la descrizione delle pagine non serve: l'interruttore non c'è. */
  ai: boolean;
  readDescriptions: boolean;
  onReadDescriptions: (value: boolean) => unknown;
  excludedDomains: string[];
  onChange: (value: string[]) => unknown;
}

function PrivacySection({ ai, readDescriptions, onReadDescriptions, excludedDomains, onChange }: PrivacySectionProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    hasDescriptionPermission().then(setPermitted);
  }, []);

  /** L'interruttore è acceso solo se l'opzione è salvata e il permesso c'è davvero. */
  const on = readDescriptions && permitted === true;

  function toggle(next: boolean) {
    setDenied(false);
    if (next) {
      // permissions.request va chiamato subito, dentro il gesto dell'utente, prima di ogni await.
      browser.permissions
        .request({ origins: [ALL_URLS] })
        .then(async (granted) => {
          setPermitted(granted);
          setDenied(!granted);
          await onReadDescriptions(granted);
        })
        .catch((err) => console.error('autoGroup:', err));
    } else {
      browser.permissions
        .remove({ origins: [ALL_URLS] })
        .catch((err) => console.error('autoGroup:', err))
        .then(async () => {
          setPermitted(await hasDescriptionPermission());
          await onReadDescriptions(false);
        });
    }
  }

  function add() {
    const domain = normalizeDomain(draft);
    if (!domain) return setError('optionsDomainInvalid');
    if (excludedDomains.includes(domain)) return setError('optionsDomainDuplicate');
    setError(null);
    setDraft('');
    onChange([...excludedDomains, domain].sort());
  }

  return (
    <Card id="privacy" title={t('optionsPrivacy')}>
      {ai && (
        <div className="setting">
          <label className="toggle">
            <span className="setting-text">
              <strong>{t('optionsReadDescriptions')}</strong>
              <span className="hint">{t('optionsReadDescriptionsHint')}</span>
            </span>
            <input type="checkbox" role="switch" checked={on} disabled={permitted === null} onChange={(e) => toggle(e.target.checked)} />
          </label>
          {denied && <p className="hint error">{t('optionsReadDescriptionsDenied')}</p>}
        </div>
      )}
      <div className="setting">
        <strong>{t('optionsExcludedDomains')}</strong>
        <p className="hint">{t('optionsExcludedDomainsHint')}</p>
        <form
          className="inline-form"
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
            aria-invalid={error !== null}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="tonal">
            {t('optionsAdd')}
          </button>
        </form>
        {error && <p className="hint error">{t(error)}</p>}
        {excludedDomains.length === 0 ? (
          <p className="empty">{t('optionsNoExcludedDomains')}</p>
        ) : (
          <ul className="domains">
            {excludedDomains.map((domain) => (
              <li key={domain} className="chip">
                <span>{domain}</span>
                <button
                  className="icon danger"
                  title={t('optionsRemove')}
                  aria-label={`${t('optionsRemove')}: ${domain}`}
                  onClick={() => onChange(excludedDomains.filter((d) => d !== domain))}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
