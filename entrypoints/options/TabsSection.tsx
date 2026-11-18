import { useEffect, useState } from 'react';
import { isValidMinTabs, normalizeDomain } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { Card } from '../../src/ui/settings/Card';

interface TabsSectionProps {
  minTabs: number;
  onMinTabs: (value: number) => unknown;
  excludedDomains: string[];
  onExcludedDomains: (value: string[]) => unknown;
}

/** "Tabs to organize": how many tabs are needed for a new group and which domains never to touch. */
export function TabsSection({ minTabs, onMinTabs, excludedDomains, onExcludedDomains }: TabsSectionProps) {
  const [value, setValue] = useState(String(minTabs));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = value.trim() !== '' && isValidMinTabs(Number(value));
  // Follows the saved value when it changes from outside (import, "Undo", another page), not while typing.
  useEffect(() => {
    if (Number(value) !== minTabs) setValue(String(minTabs));
  }, [minTabs]);

  function add() {
    const domain = normalizeDomain(draft);
    if (!domain) return setError('optionsDomainInvalid');
    if (excludedDomains.includes(domain)) return setError('optionsDomainDuplicate');
    setError(null);
    setDraft('');
    onExcludedDomains([...excludedDomains, domain].sort());
  }

  return (
    <Card id="tabs" title={t('optionsTabs')}>
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
            aria-describedby="min-tabs-hint"
            onChange={(e) => {
              setValue(e.target.value);
              const next = Number(e.target.value);
              if (e.target.value.trim() !== '' && isValidMinTabs(next) && next !== minTabs) onMinTabs(next);
            }}
          />
          {/* Always present and live: switching from hint to error reads the new text out. */}
          <p id="min-tabs-hint" className={valid ? 'hint' : 'hint error'} aria-live="polite">
            {valid ? t('optionsMinTabsHint') : t('optionsMinTabsInvalid')}
          </p>
        </div>
      </div>
      <div className="setting excluded">
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
            aria-describedby={error ? 'excluded-error' : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="tonal">
            {t('optionsAdd')}
          </button>
        </form>
        {error && (
          <p id="excluded-error" className="hint error" role="alert">
            {t(error)}
          </p>
        )}
        {excludedDomains.length === 0 ? (
          <p className="empty">{t('optionsNoExcludedDomains')}</p>
        ) : (
          <ul className="domains">
            {excludedDomains.map((domain) => (
              <li key={domain} className="chip">
                <span>{domain}</span>
                <button
                  className="icon danger"
                  data-tooltip={t('optionsRemove')}
                  aria-label={`${t('optionsRemove')}: ${domain}`}
                  onClick={() => onExcludedDomains(excludedDomains.filter((d) => d !== domain))}
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
