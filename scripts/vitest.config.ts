import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
    // Long timeout for deploy tests that may use network
    testTimeout: 120_000,
  },
});
