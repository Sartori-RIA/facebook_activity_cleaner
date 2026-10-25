import { useState } from 'react';
import { ActivityDetails } from './ActivityDetails';
import { ApiError, api } from './api';
import { countText, useI18n } from './i18n';
import { PeriodError, PeriodFields } from './PeriodFields';
import { periodChoice, type PeriodInput } from './period';
import type { PreviewResult } from './types';

const INITIAL_PERIOD: PeriodInput = {
  mode: 'before-2017',
  before: '',
  after: '',
  from: '',
  to: '',
  year: '',
};

export function SimulateScreen({
  onRun,
}: {
  onRun: (action: () => Promise<void>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<PeriodInput>(INITIAL_PERIOD);
  const [result, setResult] = useState<PreviewResult | null>(null);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">{t('simulate.title')}</h2>
        <p className="mt-1 text-sm text-stone-600">{t('simulate.intro')}</p>
      </header>
      <form
        className="space-y-4 rounded-3xl bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void onRun(async () => {
            let dates;
            try {
              dates = periodChoice(period);
            } catch (cause) {
              if (cause instanceof PeriodError) {
                throw new ApiError('', cause.code);
              }
              throw cause;
            }
            setResult(await api.preview({ ...dates, type: 'all' }));
          });
        }}
      >
        <PeriodFields value={period} onChange={setPeriod} t={t} />
        <button
          type="submit"
          className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white"
        >
          {t('simulate.submit')}
        </button>
      </form>
      {result ? (
        <article className="rounded-3xl border border-emerald-300 bg-emerald-50 p-5">
          <h3 className="text-lg font-semibold text-emerald-950">{t('simulate.nothing')}</h3>
          <p className="mt-1 text-sm text-emerald-900">
            {countText(
              result.eligible.length,
              t('simulate.eligibleOne'),
              t('simulate.eligibleMany'),
            )}
            {result.withheldCount > 0
              ? ` ${countText(result.withheldCount, t('simulate.withheldOne'), t('simulate.withheldMany'))}`
              : ''}
          </p>
          {result.eligible.length === 0 ? (
            <p className="mt-3 text-sm">{t('simulate.empty')}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {result.eligible.map((item) => (
                <li key={item.id} className="rounded-2xl bg-white px-4 py-3 text-sm">
                  <span className="text-xs text-stone-500">
                    {t(`type.${item.type}`).startsWith('type.')
                      ? item.type
                      : t(`type.${item.type}`)}{' '}
                    · {item.date ?? t('review.noDate')} · {t('simulate.kept')}
                  </span>
                  <ActivityDetails item={item} t={t} />
                </li>
              ))}
            </ul>
          )}
        </article>
      ) : null}
    </section>
  );
}
