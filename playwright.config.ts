import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  use: {
    headless: true,
  },
});
