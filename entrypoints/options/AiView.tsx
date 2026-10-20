import { t } from '../../src/shared/i18n';
import { Icon } from '../../src/ui/Icon';
import { NanoStatus } from '../../src/ui/settings/NanoStatus';
import { ProviderSection } from '../../src/ui/settings/ProviderSection';
import { ThresholdField } from '../../src/ui/settings/ThresholdField';
import { DescriptionsSection } from './DescriptionsSection';
import type { PageProps } from './use-save';

/**
 * AI: prima il Generatore, che basta da solo, poi la lettura delle descrizioni e il Classificatore
 * facoltativo. Nella modalità per sito la pagina resta nel menu e spiega come accendere l'AI.
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
