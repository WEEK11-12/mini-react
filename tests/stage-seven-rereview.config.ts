import { defineConfig } from '@playwright/test';
import existing from './playwright.config';
const output = process.env.REVIEW_OUTPUT;
if (!output || !process.env.REVIEW_CHROMIUM) throw new Error('Set REVIEW_OUTPUT and REVIEW_CHROMIUM');
const original = process.env.REREVIEW_PHASE === 'original';
const phase = original ? 'original' : 'adjacent';
export default defineConfig({
  ...existing,
  testMatch: original ? '**/stage-seven-review.spec.ts' : '**/stage-seven-rereview.spec.ts',
  outputDir: `${output}/rereview-${phase}-browser-artifacts`,
  reporter: [['list'], ['json', { outputFile: `${output}/rereview-${phase}-browser.json` }]],
  use: { ...existing.use, launchOptions: { executablePath: process.env.REVIEW_CHROMIUM } },
});
