import { browser } from 'wxt/browser';

/** Apre le impostazioni sulla sezione indicata. */
export function openSettings(section: 'generator' | 'classifier' | 'categories' | 'mode') {
  browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
}
