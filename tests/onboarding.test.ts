import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { onboardingSteps, openOnboardingOnInstall } from '../src/shared/onboarding';

let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakeBrowser.reset();
  create = vi.spyOn(fakeBrowser.tabs, 'create');
});

describe('guida al primo avvio', () => {
  it('con l\'AI guida anche Generatore e Classificatore; per sito salta i provider', () => {
    expect(onboardingSteps('ai')).toEqual(['welcome', 'mode', 'generator', 'classifier', 'done']);
    expect(onboardingSteps('domain')).toEqual(['welcome', 'mode', 'done']);
  });

  it('si apre in una scheda alla prima installazione', async () => {
    await openOnboardingOnInstall({ reason: 'install' });

    expect(create).toHaveBeenCalledExactlyOnceWith({ url: fakeBrowser.runtime.getURL('/onboarding.html') });
  });

  it.each([
    { reason: 'update', previousVersion: '0.1.0' },
    { reason: 'chrome_update' },
    { reason: 'shared_module_update', id: 'abc' },
  ] as Browser.runtime.InstalledDetails[])('non si apre dopo "$reason"', async (details) => {
    await openOnboardingOnInstall(details);

    expect(create).not.toHaveBeenCalled();
  });
});
