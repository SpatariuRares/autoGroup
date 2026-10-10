import type { GroupingMode, Settings } from '../../src/settings';
import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { providerName } from '../../src/ui/provider-name';
import { openSettings } from './open-settings';

/** Selettore *Per sito* / *Con AI* sotto la barra in alto, con il riepilogo dei provider. */
export function ModePicker({ settings, disabled, onChoose }: { settings: Settings; disabled: boolean; onChoose: (mode: GroupingMode) => void }) {
  return (
    <div className="mode-picker">
      <div className="segmented" role="radiogroup" aria-label={t('optionsMode')}>
        {(['domain', 'ai'] as const).map((mode) => (
          <button
            key={mode}
            role="radio"
            aria-checked={settings.mode === mode}
            className={settings.mode === mode ? 'selected' : ''}
            disabled={disabled}
            onClick={() => onChoose(mode)}
          >
            {settings.mode === mode ? <Icon name="check" size={18} /> : <Icon name={mode === 'domain' ? 'language' : 'category'} size={18} />}
            {t(mode === 'domain' ? 'panelModeSite' : 'panelModeAi')}
          </button>
        ))}
      </div>
      <ProviderSummary settings={settings} />
    </div>
  );
}

/** Riepilogo dei provider sotto il selettore: cosa verrà usato con la modalità scelta. */
function ProviderSummary({ settings }: { settings: Settings }) {
  if (settings.mode === 'domain') return <p className="mode-summary">{t('panelModeSiteSummary')}</p>;
  const names = [providerName('classifier', settings.classifier), providerName('generator', settings.generator)].filter((n): n is string => n !== null);
  return (
    <p className="mode-summary">
      {names.length > 0 ? names.join(' → ') : t('panelNoProvider')}{' '}
      <a href="#" onClick={(e) => { e.preventDefault(); openSettings(names.length > 0 ? 'classifier' : 'generator'); }}>
        {t('panelChangeProviders')}
      </a>
    </p>
  );
}
