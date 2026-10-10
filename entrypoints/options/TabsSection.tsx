import { useState } from 'react';
import { isValidMinTabs, normalizeDomain } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { Card } from './Card';

interface TabsSectionProps {
  minTabs: number;
  onMinTabs: (value: number) => unknown;
  excludedDomains: string[];
  onExcludedDomains: (value: string[]) => unknown;
}

/** "Tab da organizzare": quante tab servono per un gruppo nuovo e quali domini non toccare mai. */
export function TabsSection({ minTabs, onMinTabs, excludedDomains, onExcludedDomains }: TabsSectionProps) {
  const [value, setValue] = useState(String(minTabs));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = value.trim() !== '' && isValidMinTabs(Number(value));

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
            onChange={(e) => {
              setValue(e.target.value);
              const next = Number(e.target.value);
              if (e.target.value.trim() !== '' && isValidMinTabs(next) && next !== minTabs) onMinTabs(next);
            }}
          />
          <p className={valid ? 'hint' : 'hint error'}>{valid ? t('optionsMinTabsHint') : t('optionsMinTabsInvalid')}</p>
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
