import { browser, type Browser } from 'wxt/browser';
import type { GroupingMode } from '../settings';

/** Pagina della guida, aperta all'installazione e dal link "Rivedi la guida" delle impostazioni. */
export const ONBOARDING_PATH = '/onboarding.html';

export type OnboardingStep = 'welcome' | 'mode' | 'generator' | 'classifier' | 'done';

/**
 * Passi della guida. Con l'AI ci sono anche il Generatore e il Classificatore (facoltativo): prima il
 * Generatore, che basta da solo (Gemini Nano è già scelto), poi il Classificatore per chi ne ha uno.
 */
export function onboardingSteps(mode: GroupingMode): OnboardingStep[] {
  return mode === 'ai' ? ['welcome', 'mode', 'generator', 'classifier', 'done'] : ['welcome', 'mode', 'done'];
}

/** Al primo avvio apre la guida in una scheda; aggiornamenti e ricaricamenti non la riaprono. */
export async function openOnboardingOnInstall(details: Browser.runtime.InstalledDetails): Promise<void> {
  if (details.reason !== 'install') return;
  await browser.tabs.create({ url: browser.runtime.getURL(ONBOARDING_PATH) });
}
