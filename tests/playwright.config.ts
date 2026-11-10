import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './browser',
  timeout: 10000,
  expect: { timeout: 3000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'reports/browser.json' }]],
  use: {
    baseURL: process.env.MINI_REACT_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
