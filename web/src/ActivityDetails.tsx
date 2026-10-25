import { publicFacebookUrl } from '../../src/utils/facebook-url';
import type { ActivityCard } from './types';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

export function ActivityDetails({ item, t }: { item: ActivityCard; t: Translate }) {
  const address = publicFacebookUrl(item.url);
  return (
    <>
      <p className="mt-3 text-base whitespace-pre-wrap">{item.text ?? t('review.noText')}</p>
      {item.label && item.label !== item.text ? (
        <p className="mt-1 text-sm text-stone-500">{item.label}</p>
      ) : null}
      {item.sharedFrom ? (
        <p className="mt-1 text-sm text-stone-600">
          {t('review.sharedFrom', { value: item.sharedFrom })}
        </p>
      ) : null}
      {item.author ? <p className="mt-1 text-sm text-stone-500">{item.author}</p> : null}
      {address ? (
        <a
          href={address}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold break-all text-emerald-900 underline"
        >
          {t('review.open')}
          <span className="mt-1 block font-normal text-stone-500">{address}</span>
        </a>
      ) : (
        <p className="mt-3 text-sm text-stone-500">{t('review.noLink')}</p>
      )}
    </>
  );
}
