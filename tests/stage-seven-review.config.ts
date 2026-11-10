import { defineConfig } from '@playwright/test';
import existing from './playwright.config';

const output = process.env.REVIEW_OUTPUT;
if (!output || !process.env.REVIEW_CHROMIUM) throw new Error('Set REVIEW_OUTPUT and REVIEW_CHROMIUM');
const regression = process.env.REVIEW_SUITE === 'regression';
export default defineConfig({
  ...existing,
  testMatch: regression ? '**/*.spec.ts' : '**/stage-seven-review.spec.ts',
  testIgnore: regression ? ['**/phase-two.spec.ts', '**/stage-seven-review.spec.ts'] : [],
  outputDir: `${output}/browser-${regression ? 'regression' : 'independent'}-artifacts`,
  reporter: [['list'], ['json', { outputFile: `${output}/browser-${regression ? 'regression' : 'independent'}.json` }]],
  use: {
    ...existing.use,
    baseURL: 'http://127.0.0.1:5187',
    launchOptions: { executablePath: process.env.REVIEW_CHROMIUM },
  },
});
