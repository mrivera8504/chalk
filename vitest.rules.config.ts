import { defineConfig } from 'vitest/config';

/**
 * The Firestore rules, against the real thing: the emulator.
 *
 * Apart from the unit suite because that one aliases `firebase/firestore` to an
 * in-memory stand-in, which knows nothing about rules — and rules are the one
 * part of the cloud that cannot be reasoned about safely. `npm run test:rules`
 * starts the emulator, runs these, and stops it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
