import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Kept apart from vite.config.ts on purpose: the app build registers a service
 * worker and shells out to git for the build stamp, and neither belongs in a
 * test run.
 */
export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify('test') },
  resolve: {
    alias: {
      // No test talks to a real cloud. See tests/store/firestoreShim.ts.
      'firebase/firestore': fileURLToPath(new URL('./tests/store/firestoreShim.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // jsdom reports every page as hidden unless told otherwise, and the
    // foreground pull only runs for a page somebody is looking at.
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
  },
});
