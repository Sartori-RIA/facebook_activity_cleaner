import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

test('reads the local activity fixture without opening Facebook', async ({ page }) => {
  const fixture = pathToFileURL(path.join(process.cwd(), 'tests/fixtures/activity-log.html'));
  await page.goto(fixture.href);
  await expect(page.locator('[data-fixture-activity]')).toHaveCount(10);
  await expect(page.getByText('Natal com a família')).toHaveCount(1);
});
