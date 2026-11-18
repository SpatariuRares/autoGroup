import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { onboardingSteps, openOnboardingOnInstall } from '../src/shared/onboarding';

let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakeBrowser.reset();
  create = vi.spyOn(fakeBrowser.tabs, 'create');
});

describe('first-run guide', () => {
  it('with AI the guide also covers Generator and Classifier; by site it skips the providers', () => {
    expect(onboardingSteps('ai')).toEqual(['welcome', 'mode', 'generator', 'classifier', 'done']);
    expect(onboardingSteps('domain')).toEqual(['welcome', 'mode', 'done']);
  });

  it('opens in a tab on the first installation', async () => {
    await openOnboardingOnInstall({ reason: 'install' });

    expect(create).toHaveBeenCalledExactlyOnceWith({ url: fakeBrowser.runtime.getURL('/onboarding.html') });
  });

  it.each([
    { reason: 'update', previousVersion: '0.1.0' },
    { reason: 'chrome_update' },
    { reason: 'shared_module_update', id: 'abc' },
  ] as Browser.runtime.InstalledDetails[])('does not open after "$reason"', async (details) => {
    await openOnboardingOnInstall(details);

    expect(create).not.toHaveBeenCalled();
  });
});
