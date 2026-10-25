import { describe, expect, it } from 'vitest';
import { en } from '../../web/src/i18n/en';
import { es } from '../../web/src/i18n/es';
import { localeFromLanguages, resolveLocale } from '../../web/src/i18n/locale';
import { messagePaths, pt } from '../../web/src/i18n/pt';

describe('interface language', () => {
  it('follows the browser language and falls back to Portuguese', () => {
    expect(localeFromLanguages(['es-MX', 'en-US'])).toBe('es');
    expect(localeFromLanguages(['en-GB'])).toBe('en');
    expect(localeFromLanguages(['pt-PT', 'en'])).toBe('pt');
    expect(localeFromLanguages(['fr-FR'])).toBe('pt');
    expect(resolveLocale('en', ['pt-BR'])).toBe('en');
    expect(resolveLocale(null, ['es'])).toBe('es');
  });

  it('keeps the same phrases in Portuguese, Spanish, and English', () => {
    expect(messagePaths(es)).toEqual(messagePaths(pt));
    expect(messagePaths(en)).toEqual(messagePaths(pt));
  });
});
