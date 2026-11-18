import { browser, type Browser } from 'wxt/browser';
import type { GroupingMode } from '../settings';

/** Guide page, opened at installation and from the "Show the guide again" link in the settings. */
export const ONBOARDING_PATH = '/onboarding.html';

export type OnboardingStep = 'welcome' | 'mode' | 'generator' | 'classifier' | 'done';

/**
 * Steps of the guide. With the AI there are also the Generator and the Classifier (optional): first the
 * Generator, which is enough on its own (Gemini Nano is already selected), then the Classifier for those who have one.
 */
export function onboardingSteps(mode: GroupingMode): OnboardingStep[] {
  return mode === 'ai' ? ['welcome', 'mode', 'generator', 'classifier', 'done'] : ['welcome', 'mode', 'done'];
}

/** On first start opens the guide in a tab; updates and reloads do not reopen it. */
export async function openOnboardingOnInstall(details: Browser.runtime.InstalledDetails): Promise<void> {
  if (details.reason !== 'install') return;
  await browser.tabs.create({ url: browser.runtime.getURL(ONBOARDING_PATH) });
}
