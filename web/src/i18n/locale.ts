export const LOCALES = ['pt', 'es', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_STORAGE_KEY = 'fb-cleaner.locale';

export function localeFromLanguages(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'pt' || base === 'es' || base === 'en') {
      return base;
    }
  }
  return 'pt';
}

export function isLocale(value: string | null): value is Locale {
  return value === 'pt' || value === 'es' || value === 'en';
}

export function resolveLocale(saved: string | null, languages: readonly string[]): Locale {
  if (isLocale(saved)) {
    return saved;
  }
  return localeFromLanguages(languages);
}

export function htmlLang(locale: Locale): string {
  if (locale === 'pt') {
    return 'pt-BR';
  }
  return locale;
}
