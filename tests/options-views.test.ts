import { describe, expect, it } from 'vitest';
import { resolveHash } from '../entrypoints/options/views';

describe('settings pages from the address', () => {
  it('without an address, or with an unknown one, opens General', () => {
    expect(resolveHash('')).toEqual({ view: 'general' });
    expect(resolveHash('#boh')).toEqual({ view: 'general' });
  });

  it('the name of a page opens that page from the top', () => {
    expect(resolveHash('#categories')).toEqual({ view: 'categories' });
    expect(resolveHash('#ai')).toEqual({ view: 'ai' });
    expect(resolveHash('#about')).toEqual({ view: 'about' });
  });

  it('the links of the panel warnings open the right page on the section', () => {
    expect(resolveHash('#generator')).toEqual({ view: 'ai', section: 'generator' });
    expect(resolveHash('#classifier')).toEqual({ view: 'ai', section: 'classifier' });
    expect(resolveHash('#mode')).toEqual({ view: 'general', section: 'mode' });
  });

  it('every tab of the pages opens from its address, in the page that contains it', () => {
    expect(resolveHash('#backup')).toEqual({ view: 'general', section: 'backup' });
    expect(resolveHash('#autogroup')).toEqual({ view: 'categories', section: 'autogroup' });
    expect(resolveHash('#descriptions')).toEqual({ view: 'ai', section: 'descriptions' });
    expect(resolveHash('#about-privacy')).toEqual({ view: 'about', section: 'about-privacy' });
  });

  it('the section names of the old single page still lead to where they ended up', () => {
    expect(resolveHash('#behavior')).toEqual({ view: 'general', section: 'behavior' });
    expect(resolveHash('#privacy')).toEqual({ view: 'general', section: 'privacy' });
  });
});
