import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['test/**/*.test.ts', '__tests__/**/*.test.ts'],
    watch: false,
    environment: 'node',
  },
});
