import { fakeBrowser } from 'wxt/testing/fake-browser';

export interface FakePage {
  /** Meta description della pagina (null = assente). */
  description: string | null;
  /** Ritardo della risposta in ms; `Infinity` = la pagina non risponde mai. */
  delay?: number;
}

/** Sostituisce chrome.scripting.executeScript: ogni tab risponde con la descrizione indicata. */
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
