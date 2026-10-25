import { describe, expect, it } from 'vitest';
import { parseFacebookExportHtml } from '../../src/scanner/facebook-export.js';

const POST = `
<section class="_a6-g">
  <h2>Alex compartilhou um post.</h2>
  <div><div>Quarterly planning notes</div></div>
  <footer><a href="https://www.facebook.com/dyi/l/?l=token"><div>fev 24, 2017 5:42:46 da tarde/noite</div></a></footer>
</section>
<section class="_a6-g">
  <h2>Alex compartilhou uma foto.</h2>
  <div>Beach afternoon</div>
  <footer><div>fev 31, 2017 1:00:00 da manhã</div></footer>
</section>
<section class="_a6-g">
  <h2>Alex comentou no post de Natanaiah.</h2>
  <div>See you there</div>
  <footer><div>mar 02, 2016 8:14:34 da manhã</div></footer>
  <a href="https://www.facebook.com/example/posts/1?fbclid=abc&amp;c_user=1">post</a>
</section>`;

const REACTION = `
<section>
  <section>
    <table><tr><td>Reação</td><td>Curtir</td></tr></table>
    <a href="https://www.facebook.com/example/posts/9">abrir</a>
  </section>
  <footer><div>jan 03, 2015 10:07:14 da manhã</div></footer>
</section>`;

describe('facebook export html', () => {
  it('reads posts, comments, and a reaction from the export markup', () => {
    const items = parseFacebookExportHtml(`${POST}${REACTION}`);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      activityType: 'post',
      ownership: 'owned',
      authorName: 'Alex',
      textPreview: 'Quarterly planning notes',
      occurredText: '2017-02-24',
      datePrecision: 'day',
      sourceUrl: 'https://www.facebook.com/dyi/l/?l=token',
    });
    expect(items[1]).toMatchObject({
      activityType: 'media',
      mediaClassification: 'unclassified',
    });
    expect(items[1]?.occurredText).toBeUndefined();
    expect(items[2]).toMatchObject({
      activityType: 'comment',
      parentAuthorName: 'Natanaiah',
      occurredText: '2016-03-02',
    });
    expect(items[2]?.sourceUrl).toBeUndefined();
    expect(items[3]).toMatchObject({
      activityType: 'reaction',
      occurredText: '2015-01-03',
      sourceUrl: 'https://www.facebook.com/example/posts/9',
    });
  });

  it('returns nothing for html that is not an export or a fixture', () => {
    expect(parseFacebookExportHtml('<p>https://www.facebook.com/me</p>')).toEqual([]);
  });
});
