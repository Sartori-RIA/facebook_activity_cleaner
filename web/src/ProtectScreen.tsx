import { useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';
import type { Overview } from './types';

const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'other'] as const;
type RelationshipKey = (typeof RELATIONSHIPS)[number];

const LEGACY_RELATIONSHIP: Record<string, RelationshipKey> = {
  cônjuge: 'spouse',
  'filho ou filha': 'child',
  'pai ou mãe': 'parent',
  'irmão ou irmã': 'sibling',
  'outra pessoa': 'other',
};

function relationshipLabel(
  value: string | null,
  t: (path: string) => string,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }
  const key = (RELATIONSHIPS as readonly string[]).includes(value)
    ? value
    : LEGACY_RELATIONSHIP[value];
  return key ? t(`relationship.${key}`) : value;
}

export function ProtectScreen({
  overview,
  onRun,
}: {
  overview: Overview;
  onRun: (action: () => Promise<void>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipKey>('spouse');
  const [profileUrl, setProfileUrl] = useState('');
  const [keyword, setKeyword] = useState('');

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">{t('protect.title')}</h2>
        <p className="mt-1 text-sm text-stone-600">{t('protect.intro')}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const person = name.trim();
            void onRun(async () => {
              await api.addPerson({
                name: person,
                relationship,
                ...(profileUrl.trim() ? { profileUrl: profileUrl.trim() } : {}),
              });
              setName('');
              setProfileUrl('');
            });
          }}
        >
          <h3 className="font-semibold">{t('protect.personTitle')}</h3>
          <label className="block text-sm">
            {t('protect.name')}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
              placeholder={t('protect.namePlaceholder')}
            />
          </label>
          <label className="block text-sm">
            {t('protect.relationship')}
            <select
              value={relationship}
              onChange={(event) => setRelationship(event.target.value as RelationshipKey)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
            >
              {RELATIONSHIPS.map((key) => (
                <option key={key} value={key}>
                  {t(`relationship.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {t('protect.profile')}
            <input
              value={profileUrl}
              onChange={(event) => setProfileUrl(event.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
              placeholder={t('protect.profilePlaceholder')}
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white"
          >
            {t('protect.savePerson')}
          </button>
        </form>
        <form
          className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            const word = keyword.trim();
            void onRun(async () => {
              await api.addKeyword(word);
              setKeyword('');
            });
          }}
        >
          <h3 className="font-semibold">{t('protect.keywordTitle')}</h3>
          <p className="text-sm text-stone-600">
            {t('protect.keywordIntro', {
              words: overview.familyMemories.keywords.slice(0, 8).join(', '),
            })}
          </p>
          <label className="block text-sm">
            {t('protect.keyword')}
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
              placeholder={t('protect.keywordPlaceholder')}
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {t('protect.saveKeyword')}
          </button>
        </form>
      </div>
      <article className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-semibold">{t('protect.savedTitle')}</h3>
        {overview.people.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">{t('protect.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {overview.people.map((person) => (
              <li
                key={person.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
              >
                <span className="font-medium">{person.name}</span>
                <span className="text-stone-500">
                  {relationshipLabel(person.relationship, t, t('protect.personFallback'))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
