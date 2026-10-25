import { useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';
import type { Overview } from './types';

export function AccountBar({
  account,
  editing,
  onEdit,
  onRun,
}: {
  account: Overview['account'];
  editing: boolean;
  onEdit: (open: boolean) => void;
  onRun: (action: () => Promise<void>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(account?.name ?? '');
  const [profileUrl, setProfileUrl] = useState(account?.profileUrl ?? '');

  return (
    <section aria-label={t('account.label')} className="border-t border-stone-200 bg-stone-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 py-3">
        {account && !editing ? (
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
              {t('account.savedTitle')}
            </p>
            <p className="truncate text-base font-semibold">{account.name}</p>
            {account.profileUrl ? (
              <p className="truncate text-sm text-stone-600">{account.profileUrl}</p>
            ) : null}
            <p className="mt-1 max-w-xl text-xs text-stone-500">{t('account.notConnected')}</p>
          </div>
        ) : !editing ? (
          <div className="max-w-xl">
            <p className="font-semibold">{t('account.emptyTitle')}</p>
            <p className="mt-1 text-sm text-stone-600">{t('account.emptyBody')}</p>
          </div>
        ) : (
          <form
            className="grid w-full max-w-xl gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const nextName = name.trim();
              const nextUrl = profileUrl.trim();
              void onRun(async () => {
                await api.saveAccount({
                  name: nextName,
                  ...(nextUrl ? { profileUrl: nextUrl } : {}),
                });
                onEdit(false);
              });
            }}
          >
            <label className="block text-sm sm:col-span-2">
              {t('account.name')}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
                placeholder={t('account.namePlaceholder')}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              {t('account.url')}
              <input
                value={profileUrl}
                onChange={(event) => setProfileUrl(event.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
                placeholder={t('account.urlPlaceholder')}
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="submit"
                className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('account.save')}
              </button>
              <button
                type="button"
                className="rounded-full border border-stone-300 px-4 py-2 text-sm"
                onClick={() => onEdit(false)}
              >
                {t('account.cancel')}
              </button>
            </div>
          </form>
        )}
        {!editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setName(account?.name ?? '');
                setProfileUrl(account?.profileUrl ?? '');
                onEdit(true);
              }}
            >
              {account ? t('account.change') : t('account.inform')}
            </button>
            {account ? (
              <button
                type="button"
                className="rounded-full border border-stone-300 px-4 py-2 text-sm"
                onClick={() =>
                  void onRun(() => api.saveAccount({ name: '' }).then(() => undefined))
                }
              >
                {t('account.clear')}
              </button>
            ) : null}
          </div>
        ) : null}
        <details open className="w-full rounded-2xl bg-white px-4 py-3 text-sm text-stone-700">
          <summary className="cursor-pointer font-semibold text-stone-900">
            {t('account.downloadSummary')}
          </summary>
          <p className="mt-2 max-w-3xl">{t('account.downloadLead')}</p>
          <ol className="mt-2 max-w-3xl list-decimal space-y-1 pl-5">
            <li>{t('account.downloadStep1')}</li>
            <li>{t('account.downloadStep2')}</li>
            <li>{t('account.downloadStep3')}</li>
            <li>{t('account.downloadStep4')}</li>
            <li>{t('account.downloadStep5')}</li>
          </ol>
          <p className="mt-2 max-w-3xl text-stone-500">{t('account.downloadLimit')}</p>
        </details>
      </div>
    </section>
  );
}
