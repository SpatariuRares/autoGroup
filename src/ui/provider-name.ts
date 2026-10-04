import { NANO_LABEL } from '../ai/nano-generator';
import { NANO_PRESET, presetsOf, type ProviderRole, type ProviderSettings } from '../settings';
import { t } from '../shared/i18n';

/** Nome breve del provider scelto ("Rizzo Flow", "Gemini Nano", "Personalizzato"), o null se è spento. */
export function providerName(role: ProviderRole, provider: ProviderSettings): string | null {
  if (provider.preset === 'none') return null;
  if (provider.preset === NANO_PRESET) return NANO_LABEL;
  return presetsOf(role)[provider.preset]?.label ?? t('optionsPresetCustom');
}
