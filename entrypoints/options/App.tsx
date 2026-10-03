import { useEffect, useRef, useState } from 'react';
import { t } from '../../src/shared/i18n';
import { isValidMinTabs, loadSettings, normalizeDomain, saveSettings, type Settings } from '../../src/settings';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  async function update(patch: Partial<Settings>) {
    await saveSettings(patch);
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
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
      <BehaviorSection minTabs={settings.minTabs} onChange={(minTabs) => update({ minTabs })} />
      <PrivacySection
        excludedDomains={settings.excludedDomains}
        onChange={(excludedDomains) => update({ excludedDomains })}
      />
    </main>
  );
}

function BehaviorSection({ minTabs, onChange }: { minTabs: number; onChange: (value: number) => void }) {
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

function PrivacySection({ excludedDomains, onChange }: { excludedDomains: string[]; onChange: (value: string[]) => void }) {
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
