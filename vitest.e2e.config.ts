import { defineConfig } from 'vitest/config';

/**
 * The tests that need a real browser: the pen.
 *
 * Apart from the unit suite because they start a dev server and a Chromium, and
 * take seconds where the others take milliseconds. `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    globalSetup: ['tests/e2e/server.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
