import { fakeBrowser } from 'wxt/testing/fake-browser';

export interface FakePage {
  /** Meta description of the page (null = absent). */
  description: string | null;
  /** Response delay in ms; `Infinity` = the page never responds. */
  delay?: number;
}

/** Replaces chrome.scripting.executeScript: every tab responds with the given description. */
export function installFakeScripting(pages: Map<number, FakePage>) {
  const read: number[] = [];
  Object.assign(fakeBrowser.scripting, {
    async executeScript(injection: { target: { tabId: number } }) {
      const tabId = injection.target.tabId;
      read.push(tabId);
      const page = pages.get(tabId);
      if (!page) throw new Error(`Cannot access contents of tab ${tabId}`);
      if (page.delay === Infinity) return new Promise(() => {});
      if (page.delay) await new Promise((r) => setTimeout(r, page.delay));
      return [{ frameId: 0, result: page.description, documentId: 'd' }];
    },
  });
  return { read };
}
