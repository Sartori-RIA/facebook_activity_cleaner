import { useRef, useState } from 'react';
import { ApiError, api } from './api';
import { countText, useI18n } from './i18n';
import { describePeriod, PeriodError, PeriodFields } from './PeriodFields';
import { periodChoice, type PeriodInput } from './period';
import type { Overview, ScanResult } from './types';

const MAX_FIXTURE_HTML = 8_000_000;

const INITIAL_PERIOD: PeriodInput = {
  mode: 'before-2017',
  before: '',
  after: '',
  from: '',
  to: '',
  year: '',
};

export function ScanScreen({
  overview,
  error,
  onRun,
  onReview,
}: {
  overview: Overview;
  error: string | null;
  onRun: (action: () => Promise<void>) => Promise<void>;
  onReview: () => void;
}) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<PeriodInput>(INITIAL_PERIOD);
  const [useSample, setUseSample] = useState(overview.sampleFixtureAvailable);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [resultDetail, setResultDetail] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">{t('scan.title')}</h2>
        <p className="mt-1 text-sm text-stone-600">{t('scan.intro')}</p>
      </header>
      <form
        className="space-y-4 rounded-3xl bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setResult(null);
          void onRun(async () => {
            try {
              let dates;
              try {
                dates = periodChoice(period);
              } catch (cause) {
                if (cause instanceof PeriodError) {
                  throw new ApiError('', cause.code);
                }
                throw cause;
              }
              setResultDetail(describePeriod(dates, t));
              let fixtureHtml: string | undefined;
              if (file && !useSample) {
                fixtureHtml = await file.text();
                if (!fixtureHtml.trim()) {
                  throw new ApiError('', 'file_empty');
                }
                if (fixtureHtml.length > MAX_FIXTURE_HTML) {
                  throw new ApiError('', 'file_too_large');
                }
              }
              setResult(
                await api.scan({
                  ...dates,
                  ...(fixtureHtml !== undefined ? { fixtureHtml } : { useSample }),
                }),
              );
            } finally {
              setBusy(false);
            }
          });
        }}
      >
        <PeriodFields value={period} onChange={setPeriod} t={t} />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={useSample}
            onChange={(event) => {
              setUseSample(event.target.checked);
              if (event.target.checked) {
                setFile(null);
                if (fileInput.current) {
                  fileInput.current.value = '';
                }
              }
            }}
          />
          <span>
            {t('scan.sample')}
            <span className="block text-xs text-stone-500">
              {overview.sampleFixtureAvailable ? t('scan.sampleReady') : t('scan.sampleMissing')}
            </span>
          </span>
        </label>
        <label className="block text-sm">
          {t('scan.file')}
          <input
            ref={fileInput}
            type="file"
            accept=".html,.htm,text/html"
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-stone-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              if (chosen) {
                setUseSample(false);
              }
            }}
          />
          <span className="mt-1 block text-xs text-stone-500">
            {file ? t('scan.fileChosen', { name: file.name }) : t('scan.fileHint')}
          </span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-stone-400"
        >
          {busy ? t('scan.working') : t('scan.submit')}
        </button>
        {error ? <p className="text-sm text-amber-950">{error}</p> : null}
      </form>
      {result ? (
        <article className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-semibold">{t('scan.doneTitle')}</h3>
          <p className="mt-1 text-sm text-emerald-950">{resultDetail}</p>
          {result.stopReason === 'max_pages' || result.stopReason === 'stagnation' ? (
            <p className="mt-2 text-sm text-amber-950">
              {t('scan.partial', { count: result.seen })}
            </p>
          ) : null}
          <p className="mt-3 text-sm">
            {countText(result.inserted, t('scan.newOne'), t('scan.newMany'))},{' '}
            {countText(result.duplicate, t('scan.duplicateOne'), t('scan.duplicateMany'))},{' '}
            {t('scan.unknown', { count: result.unknownDate })}.
          </p>
          <button
            type="button"
            onClick={onReview}
            className="mt-4 text-sm font-semibold text-emerald-900 underline"
          >
            {t('scan.openReview')}
          </button>
        </article>
      ) : null}
    </section>
  );
}
