import { t } from '../../src/shared/i18n';
import type { GroupingMode } from '../../src/settings';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Card } from './Card';

const MODES: { id: GroupingMode; icon: IconName; title: string; hint: string }[] = [
  { id: 'domain', icon: 'language', title: 'optionsModeDomain', hint: 'optionsModeDomainHint' },
  { id: 'ai', icon: 'category', title: 'optionsModeAi', hint: 'optionsModeAiHint' },
];

/** Scelta della modalità: per sito o con l'AI. Usata dalle impostazioni e dall'onboarding. */
export function ModeSection({ mode, onChange }: { mode: GroupingMode; onChange: (mode: GroupingMode) => unknown }) {
  return (
    <Card id="mode" title={t('optionsMode')}>
      <div className="modes" role="radiogroup" aria-label={t('optionsMode')}>
        {MODES.map((m) => (
          <label key={m.id} className={`mode${mode === m.id ? ' selected' : ''}`}>
            <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => onChange(m.id)} />
            <span className="mode-icon">
              <Icon name={m.icon} />
            </span>
            <span className="mode-text">
              <strong>{t(m.title)}</strong>
              <span>{t(m.hint)}</span>
            </span>
          </label>
        ))}
      </div>
    </Card>
  );
}
