import { useCallback, useEffect, useState } from 'react';
import { AccountBar } from './AccountBar';
import { ApiError, api } from './api';
import { countText, useI18n } from './i18n';
import { LOCALES, type Locale } from './i18n/locale';
import { ProtectScreen } from './ProtectScreen';
import { ReviewScreen } from './ReviewScreen';
import { ScanScreen } from './ScanScreen';
import { SimulateScreen } from './SimulateScreen';
import { storedCount } from './stored-count';
import type { Overview, Screen } from './types';

const NAV: Array<{ id: Screen; label: string; hint: string }> = [
  { id: 'home', label: 'nav.home', hint: 'nav.homeHint' },
  { id: 'protect', label: 'nav.protect', hint: 'nav.protectHint' },
  { id: 'scan', label: 'nav.scan', hint: 'nav.scanHint' },
  { id: 'review', label: 'nav.review', hint: 'nav.reviewHint' },
  { id: 'simulate', label: 'nav.simulate', hint: 'nav.simulateHint' },
];

function errorText(cause: unknown, t: (path: string) => string): string {
  if (cause instanceof ApiError && cause.code) {
    const translated = t(`error.${cause.code}`);
    if (translated !== `error.${cause.code}`) {
      return translated;
    }
  }
  if (cause instanceof ApiError && cause.message) {
    return cause.message;
  }
  return t('error.action');
}

export function App() {
  const { locale, setLocale, t } = useI18n();
  const [screen, setScreen] = useState<Screen>('home');
  const [editingAccount, setEditingAccount] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.overview();
    setOverview(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    api
      .overview()
      .then((next) => {
        if (active) {
          setOverview(next);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(errorText(cause, t));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (screen !== 'home' || loading) {
      return;
    }
    let active = true;
    void refresh().catch((cause: unknown) => {
      if (active) {
        setError(errorText(cause, t));
      }
    });
    return () => {
      active = false;
    };
  }, [screen, loading, refresh, t]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(errorText(cause, t));
    }
  }

  const stored = overview ? storedCount(overview.counts) : 0;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
              {t('brand.eyebrow')}
            </p>
            <h1 className="text-xl font-semibold">{t('brand.title')}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="max-w-md text-sm text-stone-600">{t('brand.subtitle')}</p>
            <div
              role="group"
              aria-label={t('lang.label')}
              className="flex rounded-full bg-stone-100 p-1"
            >
              {LOCALES.map((item) => (
                <LanguageButton
                  key={item}
                  locale={item}
                  active={locale === item}
                  label={t(`lang.${item}`)}
                  onSelect={setLocale}
                />
              ))}
            </div>
          </div>
        </div>
        {overview ? (
          <AccountBar
            account={overview.account}
            editing={editingAccount}
            onEdit={setEditingAccount}
            onRun={run}
          />
        ) : null}
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-x-auto md:flex-col" aria-label={t('nav.label')}>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={`min-w-36 rounded-2xl px-4 py-3 text-left md:min-w-0 ${
                screen === item.id
                  ? 'bg-emerald-800 text-white'
                  : 'bg-white text-stone-800 shadow-sm'
              }`}
            >
              <span className="block text-sm font-semibold">{t(item.label)}</span>
              <span
                className={`block text-xs ${screen === item.id ? 'text-emerald-100' : 'text-stone-500'}`}
              >
                {t(item.hint)}
              </span>
            </button>
          ))}
        </nav>
        <main className="space-y-4">
          {error ? (
            <p
              className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {loading || !overview ? (
            <p className="rounded-3xl bg-white p-6 text-stone-600 shadow-sm">{t('loading')}</p>
          ) : screen === 'home' ? (
            <Home
              overview={overview}
              stored={stored}
              onGo={setScreen}
              onInformAccount={() => setEditingAccount(true)}
            />
          ) : screen === 'protect' ? (
            <ProtectScreen overview={overview} onRun={run} />
          ) : screen === 'scan' ? (
            <ScanScreen
              overview={overview}
              error={error}
              onRun={run}
              onReview={() => setScreen('review')}
            />
          ) : screen === 'review' ? (
            <ReviewScreen onRun={run} />
          ) : (
            <SimulateScreen onRun={run} />
          )}
        </main>
      </div>
    </div>
  );
}

function LanguageButton({
  locale,
  active,
  label,
  onSelect,
}: {
  locale: Locale;
  active: boolean;
  label: string;
  onSelect: (locale: Locale) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(locale)}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
        active ? 'bg-emerald-800 text-white' : 'text-stone-700'
      }`}
    >
      {label}
    </button>
  );
}

function Home({
  overview,
  stored,
  onGo,
  onInformAccount,
}: {
  overview: Overview;
  stored: number;
  onGo: (screen: Screen) => void;
  onInformAccount: () => void;
}) {
  const { t } = useI18n();
  const next = !overview.account
    ? {
        title: t('home.accountTitle'),
        body: t('home.accountBody'),
        action: t('home.accountAction'),
        go: onInformAccount,
      }
    : overview.people.length === 0
      ? {
          title: t('home.protectTitle'),
          body: t('home.protectBody'),
          action: t('home.protectAction'),
          go: () => onGo('protect'),
        }
      : stored === 0
        ? {
            title: t('home.scanTitle'),
            body: t('home.scanBody'),
            action: t('home.scanAction'),
            go: () => onGo('scan'),
          }
        : {
            title: t('home.reviewTitle'),
            body: countText(stored, t('home.reviewBodyOne'), t('home.reviewBodyMany')),
            action: t('home.reviewAction'),
            go: () => onGo('review'),
          };

  return (
    <section className="space-y-4">
      <article className="rounded-3xl bg-emerald-900 p-6 text-white shadow-sm">
        <h2 className="text-2xl font-semibold">{next.title}</h2>
        <p className="mt-2 max-w-2xl text-emerald-50">{next.body}</p>
        <button
          type="button"
          onClick={next.go}
          className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-emerald-900"
        >
          {next.action}
        </button>
      </article>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('home.stored')} value={String(stored)} />
        <Stat label={t('home.people')} value={String(overview.people.length)} />
        <Stat label={t('home.timezone')} value={overview.timezone} />
      </div>
      {(overview.years ?? []).length > 0 ? (
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <h3 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
            {t('home.years')}
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {(overview.years ?? []).map((entry) => (
              <li key={entry.year} className="text-lg font-semibold tabular-nums">
                {entry.year}: {entry.count}
              </li>
            ))}
          </ul>
        </article>
      ) : null}
      <article className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold">{t('home.aboutTitle')}</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-700">
          <li>{t('home.step1')}</li>
          <li>{t('home.step2')}</li>
          <li>{t('home.step3')}</li>
          <li>{t('home.step4')}</li>
        </ol>
        <p className="mt-4 text-xs text-stone-500">
          {t('home.database', { path: overview.databasePath })}
        </p>
      </article>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </article>
  );
}
