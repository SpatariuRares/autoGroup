import { NANO_LABEL } from '../ai/nano-generator';
import { NANO_PRESET, presetsOf, type ProviderRole, type ProviderSettings } from '../settings';
import { t } from '../shared/i18n';

/** Short name of the chosen provider ("Rizzo Flow", "Gemini Nano", "Custom"), or null if it is off. */
export function providerName(role: ProviderRole, provider: ProviderSettings): string | null {
  if (provider.preset === 'none') return null;
  if (provider.preset === NANO_PRESET) return NANO_LABEL;
  return presetsOf(role)[provider.preset]?.label ?? t('optionsPresetCustom');
}
