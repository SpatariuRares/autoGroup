import { describe, expect, it } from 'vitest';
import { resolveHash } from '../entrypoints/options/views';

describe('pagine delle impostazioni dall\'indirizzo', () => {
  it('senza indirizzo, o con uno sconosciuto, apre Generale', () => {
    expect(resolveHash('')).toEqual({ view: 'general' });
    expect(resolveHash('#boh')).toEqual({ view: 'general' });
  });

  it('il nome di una pagina apre quella pagina dall\'alto', () => {
    expect(resolveHash('#categories')).toEqual({ view: 'categories' });
    expect(resolveHash('#ai')).toEqual({ view: 'ai' });
    expect(resolveHash('#about')).toEqual({ view: 'about' });
  });

  it('i link degli avvisi del pannello aprono la pagina giusta sulla sezione', () => {
    expect(resolveHash('#generator')).toEqual({ view: 'ai', section: 'generator' });
    expect(resolveHash('#classifier')).toEqual({ view: 'ai', section: 'classifier' });
    expect(resolveHash('#mode')).toEqual({ view: 'general', section: 'mode' });
  });

  it('i nomi delle sezioni della vecchia pagina unica portano ancora dove sono finite', () => {
    expect(resolveHash('#behavior')).toEqual({ view: 'general', section: 'behavior' });
    expect(resolveHash('#privacy')).toEqual({ view: 'general', section: 'privacy' });
  });
});
