import { isRulesOnly, type GroupingMode, type Settings } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { moveInRadioGroup } from '../../src/ui/radio-keys';
import { providerName } from '../../src/ui/provider-name';
import { openSettings } from './open-settings';

/**
 * *By site* / *With AI* selector under the top bar, with the provider summary. Without any
 * provider the second button becomes *With rules*: only the site rules apply.
 */
export function ModePicker({ settings, disabled, onChoose }: { settings: Settings; disabled: boolean; onChoose: (mode: GroupingMode) => void }) {
  const rules = isRulesOnly({ ...settings, mode: 'ai' });
  const icon = (mode: GroupingMode) => (mode === 'domain' ? 'language' : rules ? 'rule' : 'category');
  const label = (mode: GroupingMode) => t(mode === 'domain' ? 'panelModeSite' : rules ? 'panelModeRules' : 'panelModeAi');
  return (
    <div className="mode-picker">
      <div className="segmented" role="radiogroup" aria-label={t('optionsMode')} onKeyDown={moveInRadioGroup}>
        {(['domain', 'ai'] as const).map((mode) => (
          <button
            key={mode}
            role="radio"
            aria-checked={settings.mode === mode}
            tabIndex={settings.mode === mode ? 0 : -1}
            className={settings.mode === mode ? 'selected' : ''}
            disabled={disabled}
            onClick={() => onChoose(mode)}
          >
            {settings.mode === mode ? <Icon name="check" size={18} /> : <Icon name={icon(mode)} size={18} />}
            {label(mode)}
          </button>
        ))}
      </div>
      <ProviderSummary settings={settings} />
    </div>
  );
}

/** Provider summary under the selector: what will be used with the chosen mode. */
function ProviderSummary({ settings }: { settings: Settings }) {
  if (settings.mode === 'domain') return <p className="mode-summary">{t('panelModeSiteSummary')}</p>;
  if (isRulesOnly(settings)) {
    return (
      <p className="mode-summary">
        {t('panelModeRulesSummary')}{' '}
        <button className="link" onClick={() => openSettings('categories')}>
          {t('panelEditRules')}
        </button>
      </p>
    );
  }
  const names = [providerName('classifier', settings.classifier), providerName('generator', settings.generator)].filter((n): n is string => n !== null);
  return (
    <p className="mode-summary">
      {names.join(' → ')}{' '}
      <button className="link" onClick={() => openSettings('classifier')}>
        {t('panelChangeProviders')}
      </button>
    </p>
  );
}
