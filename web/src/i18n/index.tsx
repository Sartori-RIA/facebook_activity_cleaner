import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { es } from './es';
import { htmlLang, LOCALE_STORAGE_KEY, resolveLocale, type Locale } from './locale';
import { pt } from './pt';

const catalogs = { pt, es, en };

type Vars = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function lookup(locale: Locale, path: string): string {
  const node = path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, catalogs[locale]);
  return typeof node === 'string' ? node : path;
}

export function translate(locale: Locale, path: string, vars?: Vars): string {
  const template = lookup(locale, path);
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

export function countText(count: number, one: string, many: string): string {
  return (count === 1 ? one : many).replaceAll('{count}', String(count));
}

function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
}

function readSavedLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveLocale(readSavedLocale(), browserLanguages()),
  );

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.title = translate(locale, 'documentTitle');
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale(next) {
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, next);
        } catch {
          // The choice still applies for this visit.
        }
        setLocaleState(next);
      },
      t: (path, vars) => translate(locale, path, vars),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('I18nProvider is missing');
  }
  return value;
}
