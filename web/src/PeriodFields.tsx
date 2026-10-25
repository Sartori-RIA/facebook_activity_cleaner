import { PeriodError, periodChoice, type PeriodInput, type PeriodMode } from './period';
import type { DateChoice } from './types';

export const PERIOD_MODES: PeriodMode[] = ['before-2017', 'year-2015', 'dates', 'year', 'all'];

const MODE_COPY: Record<PeriodMode, { label: string; detail: string }> = {
  'before-2017': { label: 'scan.before', detail: 'scan.beforeDetail' },
  'year-2015': { label: 'scan.year', detail: 'scan.yearDetail' },
  dates: { label: 'scan.dates', detail: 'scan.datesDetail' },
  year: { label: 'scan.yearOption', detail: 'scan.yearOptionDetail' },
  all: { label: 'scan.all', detail: 'scan.allDetail' },
};

interface Translate {
  (path: string, vars?: Record<string, string | number>): string;
}

export function describePeriod(choice: DateChoice, t: Translate): string {
  if (choice.all) {
    return t('scan.allDetail');
  }
  if (choice.year && !choice.before && !choice.after && !choice.from && !choice.to) {
    return choice.year === '2015'
      ? t('scan.yearDetail')
      : t('scan.yearChosen', { year: choice.year });
  }
  if (choice.before === '2017-01-01' && !choice.after && !choice.from && !choice.to) {
    return t('scan.beforeDetail');
  }
  const parts: string[] = [];
  if (choice.after) {
    parts.push(`${t('scan.afterLabel')} ${choice.after}`);
  }
  if (choice.before) {
    parts.push(`${t('scan.beforeLabel')} ${choice.before}`);
  }
  if (choice.from) {
    parts.push(`${t('scan.fromLabel')} ${choice.from}`);
  }
  if (choice.to) {
    parts.push(`${t('scan.toLabel')} ${choice.to}`);
  }
  return parts.join(' · ');
}

export function PeriodFields({
  value,
  onChange,
  t,
}: {
  value: PeriodInput;
  onChange: (next: PeriodInput) => void;
  t: Translate;
}) {
  function set<K extends keyof PeriodInput>(key: K, next: PeriodInput[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="space-y-3">
      <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">{t('scan.period')}</legend>
        {PERIOD_MODES.map((mode) => (
          <label
            key={mode}
            className={`cursor-pointer rounded-2xl border p-3 text-sm ${
              value.mode === mode ? 'border-emerald-700 bg-emerald-50' : 'border-stone-200'
            }`}
          >
            <input
              type="radio"
              name="period"
              className="mr-2"
              checked={value.mode === mode}
              onChange={() => set('mode', mode)}
            />
            <span className="font-medium">{t(MODE_COPY[mode].label)}</span>
            <span className="mt-1 block text-xs text-stone-500">{t(MODE_COPY[mode].detail)}</span>
          </label>
        ))}
      </fieldset>
      {value.mode === 'dates' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField
            label={t('scan.beforeLabel')}
            hint={t('scan.exclusiveHint')}
            value={value.before}
            onChange={(next) => set('before', next)}
          />
          <DateField
            label={t('scan.afterLabel')}
            hint={t('scan.exclusiveHint')}
            value={value.after}
            onChange={(next) => set('after', next)}
          />
          <DateField
            label={t('scan.fromLabel')}
            hint={t('scan.inclusiveHint')}
            value={value.from}
            onChange={(next) => set('from', next)}
          />
          <DateField
            label={t('scan.toLabel')}
            hint={t('scan.inclusiveHint')}
            value={value.to}
            onChange={(next) => set('to', next)}
          />
        </div>
      ) : null}
      {value.mode === 'year' ? (
        <label className="block max-w-xs text-sm">
          {t('scan.yearLabel')}
          <input
            type="number"
            inputMode="numeric"
            min={1970}
            max={2100}
            value={value.year}
            onChange={(event) => set('year', event.target.value)}
            placeholder="2015"
            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-stone-500">{t('scan.yearHint')}</span>
        </label>
      ) : null}
    </div>
  );
}

function DateField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
      />
      <span className="mt-1 block text-xs text-stone-500">{hint}</span>
    </label>
  );
}

export function chosenPeriod(input: PeriodInput): DateChoice {
  return periodChoice(input);
}

export { PeriodError };
