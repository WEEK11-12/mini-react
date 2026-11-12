import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['{renderer,runtime,history,harness}/**/*.test.ts'],
    setupFiles: ['./support/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 5000,
  },
});
