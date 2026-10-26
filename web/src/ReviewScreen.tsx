import { useEffect, useState } from 'react';
import { fixedReviewYears } from '../../src/review/fixed-years';
import { ActivityDetails } from './ActivityDetails';
import { api } from './api';
import { useI18n } from './i18n';
import { matchesReviewPeriod } from './review-period';
import type { ActivityCard, PreviewGroup } from './types';

const GROUPS: Array<{ id: PreviewGroup | 'all'; label: string }> = [
  { id: 'all', label: 'group.all' },
  { id: 'protected', label: 'group.protected' },
  { id: 'potential_family_memories', label: 'group.family' },
  { id: 'needs_review', label: 'group.review' },
  { id: 'safe_candidates', label: 'group.safe' },
  { id: 'skipped', label: 'group.skipped' },
];

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const GROUP_TONE: Record<PreviewGroup, string> = {
  protected: 'bg-emerald-100 text-emerald-950',
  potential_family_memories: 'bg-amber-100 text-amber-950',
  needs_review: 'bg-amber-100 text-amber-950',
  safe_candidates: 'bg-stone-200 text-stone-800',
  skipped: 'bg-stone-100 text-stone-600',
};

function reasonText(
  reason: { code: string; value: string | null },
  t: (path: string, vars?: Record<string, string | number>) => string,
): string {
  if (reason.value) {
    const withValue = t(`reason.${reason.code}`, { value: reason.value });
    if (withValue !== `reason.${reason.code}`) {
      return withValue;
    }
  }
  const plain = t(`reason.${reason.code}_plain`);
  if (plain !== `reason.${reason.code}_plain`) {
    return plain;
  }
  const direct = t(`reason.${reason.code}`);
  if (direct !== `reason.${reason.code}`) {
    return direct;
  }
  return t('reason.fallback');
}

export function ReviewScreen({ onRun }: { onRun: (action: () => Promise<void>) => Promise<void> }) {
  const { t } = useI18n();
  const years = fixedReviewYears(new Date().getFullYear());
  const [activities, setActivities] = useState<ActivityCard[]>([]);
  const [group, setGroup] = useState<PreviewGroup | 'all'>('all');
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [month, setMonth] = useState<number | 'all'>('all');
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setActivities([]);
    api
      .activities(year)
      .then((payload) => {
        if (active) {
          setActivities(payload.activities);
        }
      })
      .catch(() => {
        if (active) {
          setActivities([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [year, revision]);

  const visible = activities.filter(
    (item) =>
      (group === 'all' || item.group === group) && matchesReviewPeriod(item.date, year, month),
  );

  function reloadAfter(decision: 'protect' | 'approve_deletion' | 'skip', id: string) {
    return onRun(async () => {
      await api.review({ id, decision });
      setRevision((current) => current + 1);
    });
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">{t('review.title')}</h2>
        <p className="mt-1 text-sm text-stone-600">{t('review.intro')}</p>
        <p className="mt-2 text-sm text-stone-600">{t('review.linkHint')}</p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-stone-700">
          {t('review.year')}
          <select
            className="ml-2 rounded-full border border-stone-300 bg-white px-3 py-1.5"
            value={String(year)}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setMonth('all');
            }}
          >
            {years.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-stone-700">
          {t('review.month')}
          <select
            className="ml-2 rounded-full border border-stone-300 bg-white px-3 py-1.5"
            value={month === 'all' ? 'all' : String(month)}
            onChange={(event) => {
              const next = event.target.value;
              setMonth(next === 'all' ? 'all' : Number(next));
            }}
          >
            <option value="all">{t('review.allMonths')}</option>
            {MONTHS.map((entry) => (
              <option key={entry} value={entry}>
                {t(`month.${entry}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setGroup(item.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              group === item.id ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 shadow-sm'
            }`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      {!loaded ? <p className="text-sm text-stone-600">{t('review.loading')}</p> : null}
      {loaded && visible.length === 0 ? (
        <p className="rounded-3xl bg-white p-5 text-sm text-stone-600 shadow-sm">
          {t('review.empty')}
        </p>
      ) : null}
      <ul className="space-y-3">
        {visible.map((item) => {
          const typeLabel = t(`type.${item.type}`);
          return (
            <li key={item.id} className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${GROUP_TONE[item.group]}`}
                >
                  {t(GROUPS.find((entry) => entry.id === item.group)?.label ?? 'group.review')}
                </span>
                <span className="text-xs text-stone-500">
                  {typeLabel.startsWith('type.') ? item.type : typeLabel} ·{' '}
                  {item.date ?? t('review.noDate')}
                </span>
              </div>
              <ActivityDetails item={item} t={t} />
              {item.status === 'requires_review' ? (
                <p className="mt-3 text-sm text-amber-950">{t('review.held')}</p>
              ) : null}
              {item.reasons.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-stone-600">
                  {item.reasons.map((reason, index) => (
                    <li key={`${reason.code}-${reason.value ?? ''}-${index}`}>
                      {reasonText(reason, t)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-emerald-800 px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => void reloadAfter('protect', item.id)}
                >
                  {t('review.protect')}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-sm"
                  onClick={() => void reloadAfter('skip', item.id)}
                >
                  {t('review.skip')}
                </button>
                <button
                  type="button"
                  disabled={item.group === 'protected'}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:text-stone-400"
                  onClick={() => void reloadAfter('approve_deletion', item.id)}
                >
                  {t('review.approve')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
