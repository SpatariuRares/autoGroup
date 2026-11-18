import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { NanoStatus } from '../../src/ui/settings/NanoStatus';
import { ProviderSection } from '../../src/ui/settings/ProviderSection';
import { ThresholdField } from '../../src/ui/settings/ThresholdField';
import { DescriptionsSection } from './DescriptionsSection';
import type { PageProps } from './use-save';

/**
 * AI: first the Generator, which is enough on its own, then reading page descriptions and the optional
 * Classifier. In the by-site mode the page stays in the menu and explains how to turn the AI on.
 */
export function AiView({ settings, saving: { update, confirm } }: PageProps) {
  if (settings.mode !== 'ai') {
    return (
      <div className="banner">
        <Icon name="info" />
        <span>{t('optionsModeDomainNote')}</span>
        <button className="tonal" onClick={() => update({ mode: 'ai' })}>
          {t('optionsUseAi')}
        </button>
      </div>
    );
  }
  return (
    <>
      <ProviderSection role="generator" saved={settings.generator} nano={<NanoStatus />} onSaved={confirm} />
      <DescriptionsSection enabled={settings.readDescriptions} onChange={(readDescriptions) => update({ readDescriptions })} />
      <ProviderSection
        role="classifier"
        saved={settings.classifier}
        onSaved={confirm}
        extra={<ThresholdField threshold={settings.threshold} onChange={(threshold) => update({ threshold })} />}
      />
    </>
  );
}
