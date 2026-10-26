import { describe, expect, it } from 'vitest';
import { createStores, storeOwnedPost } from '../helpers.js';

describe('stored years', () => {
  it('counts every year from the first stored year through the last, including gaps', () => {
    const stores = createStores();
    storeOwnedPost(stores.activities, { occurredText: '2012-04-02', textPreview: 'April note' });
    storeOwnedPost(stores.activities, { occurredText: '2012-11-01', textPreview: 'November note' });
    storeOwnedPost(stores.activities, {
      occurredText: '2014',
      datePrecision: 'year',
      textPreview: 'Year note',
    });
    storeOwnedPost(stores.activities, {
      occurredText: null,
      datePrecision: 'unknown',
      textPreview: 'Undated note',
    });
    expect(stores.activities.countByYear()).toEqual([
      { year: 2012, count: 2 },
      { year: 2013, count: 0 },
      { year: 2014, count: 1 },
    ]);
    stores.close();
  });

  it('omits a deleted activity from the year count and from that year’s review list', () => {
    const stores = createStores();
    const now = new Date();
    storeOwnedPost(stores.activities, { occurredText: '2012-04-02', textPreview: 'Kept note' });
    const gone = storeOwnedPost(stores.activities, {
      occurredText: '2012-11-01',
      textPreview: 'Gone note',
    });
    storeOwnedPost(stores.activities, { occurredText: '2014-01-01', textPreview: 'Later note' });
    stores.activities.transition(gone.id, 'pending', now);
    stores.activities.transition(gone.id, 'deleting', now);
    stores.activities.transition(gone.id, 'deleted', now);
    expect(stores.activities.countByYear()).toEqual([
      { year: 2012, count: 1 },
      { year: 2013, count: 0 },
      { year: 2014, count: 1 },
    ]);
    expect(stores.activities.listByYear(2012).map((item) => item.textPreview)).toEqual([
      'Kept note',
    ]);
    expect(stores.activities.listByYear(2014).map((item) => item.textPreview)).toEqual([
      'Later note',
    ]);
    stores.close();
  });
});
