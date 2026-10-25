import { describe, expect, it } from 'vitest';
import { classifyActivityLabel } from '../../src/scanner/classify.js';
import { fingerprintActivity } from '../../src/scanner/fingerprint.js';
import { initialScrollState, nextScrollState } from '../../src/scanner/pagination.js';
import { matchesKeyword } from '../../src/utils/text.js';
import { normalizeUrl } from '../../src/utils/url.js';

describe('classification', () => {
  it('recognizes English and Portuguese activity labels', () => {
    expect(classifyActivityLabel('Alex commented on a post')).toBe('comment');
    expect(classifyActivityLabel('Alex comentou em uma publicação')).toBe('comment');
    expect(classifyActivityLabel('Alex liked a photo')).toBe('reaction');
    expect(classifyActivityLabel('Alex curtiu uma foto')).toBe('reaction');
    expect(classifyActivityLabel('Alex added a photo')).toBe('media');
    expect(classifyActivityLabel('Alex adicionou uma foto')).toBe('media');
    expect(classifyActivityLabel('Alex posted an update')).toBe('post');
    expect(classifyActivityLabel('Alex publicou uma atualização')).toBe('post');
  });

  it('leaves ambiguous and empty labels unknown', () => {
    expect(classifyActivityLabel('Alex posted and commented')).toBe('unknown');
    expect(classifyActivityLabel('')).toBe('unknown');
    expect(classifyActivityLabel('hello')).toBe('unknown');
  });
});

describe('deduplication', () => {
  it('builds the same fingerprint for the same activity and a different one when the url changes', () => {
    const first = fingerprintActivity({
      activityType: 'post',
      sourceUrl: 'https://www.facebook.com/fixture/posts/1?fbclid=abc',
      occurredText: '2015-06-01',
      datePrecision: 'day',
      textPreview: 'Quarterly planning notes',
      authorName: 'Alex',
    });
    const trackingVariant = fingerprintActivity({
      activityType: 'post',
      sourceUrl: 'https://facebook.com/fixture/posts/1/',
      occurredText: '2015-06-01',
      datePrecision: 'day',
      textPreview: '  Quarterly   planning notes ',
      authorName: 'Alex',
    });
    const other = fingerprintActivity({
      activityType: 'post',
      sourceUrl: 'https://www.facebook.com/fixture/posts/2',
      occurredText: '2015-06-01',
      datePrecision: 'day',
      textPreview: 'Quarterly planning notes',
      authorName: 'Alex',
    });
    expect(first).toBe(trackingVariant);
    expect(first).not.toBe(other);
  });
});

describe('pagination termination', () => {
  const limits = { maxStagnation: 3, maxPages: 5 };

  it('stops when the source reports the end', () => {
    const decision = nextScrollState(
      initialScrollState(),
      { signature: 'a', inserted: 1, endReached: true },
      limits,
    );
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('end');
  });

  it('stops after repeated pages with no new rows', () => {
    let state = initialScrollState();
    let decision = nextScrollState(
      state,
      { signature: 'a', inserted: 1, endReached: false },
      limits,
    );
    state = decision.state;
    for (let page = 0; page < 2; page += 1) {
      decision = nextScrollState(state, { signature: 'a', inserted: 0, endReached: false }, limits);
      state = decision.state;
      expect(decision.stop).toBe(false);
    }
    decision = nextScrollState(state, { signature: 'a', inserted: 0, endReached: false }, limits);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('stagnation');
    expect(decision.state.pages).toBe(4);
  });

  it('stops at the maximum page count', () => {
    let state = initialScrollState();
    let decision = nextScrollState(
      state,
      { signature: 'a', inserted: 1, endReached: false },
      limits,
    );
    for (let page = 1; page < 5; page += 1) {
      state = decision.state;
      decision = nextScrollState(
        state,
        { signature: `page-${page}`, inserted: 1, endReached: false },
        limits,
      );
    }
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('max_pages');
  });
});

describe('text and url normalization', () => {
  it('matches família and familia without matching familiar', () => {
    expect(matchesKeyword('Natal com a família', 'familia')).toBe(true);
    expect(matchesKeyword('a familiar street', 'family')).toBe(false);
  });

  it('drops tracking query parameters from facebook urls', () => {
    expect(normalizeUrl('https://www.facebook.com/fixture/posts/1/?fbclid=abc')).toBe(
      'facebook.com/fixture/posts/1',
    );
  });
});
