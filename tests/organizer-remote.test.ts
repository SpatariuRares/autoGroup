import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import { announceState, onOrganizerState, remoteOrganizer, serveOrganizer } from '../src/shared/organizer-remote';
import type { OrganizerState } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let stop: () => void;
const W = 1;

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  strip = installFakeTabStrip({ currentWindowId: W });
  await saveSettings({ mode: 'domain' });
  stop = serveOrganizer(createOrganizer());
});

afterEach(() => stop());

describe('the Organizer called from the panel', () => {
  it('every method reaches the service worker and returns its result', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    const proposed = await remoteOrganizer.propose(W);
    const view = await remoteOrganizer.view(W);
    const applied = await remoteOrganizer.apply();

    expect(proposed.proposal!.groups.map((g) => g.name)).toEqual(['a.com']);
    expect(view.created.map((g) => g.name)).toEqual(['a.com']);
    expect(applied.undo).toBeDefined();
    expect(strip.layout()).toEqual(['A1 [a.com]', 'A2 [a.com]']);
  });

  it("an error in the service worker becomes an exception in the panel", async () => {
    stop();
    const failing = createOrganizer();
    stop = serveOrganizer({ ...failing, state: () => Promise.reject(new Error('rotto')) });

    await expect(remoteOrganizer.state()).rejects.toThrow('rotto');
  });

  it('the methods reserved for the service worker do not respond', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });

    const response = await browser.runtime.sendMessage({ type: 'organizer/call', method: 'checkStale', args: [] });

    expect(response).toBeUndefined();
  });

  it('announced state changes reach the listeners', async () => {
    const received: OrganizerState[] = [];
    const unsubscribe = onOrganizerState((state) => received.push(state));

    announceState({ phase: 'idle', windowId: W });
    await new Promise((resolve) => setTimeout(resolve, 0));
    unsubscribe();

    expect(received).toEqual([{ phase: 'idle', windowId: W }]);
  });
});
