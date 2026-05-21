import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Mirror Next.js @/* path alias for Vitest
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    watch: false,
    environment: 'node',
  },
});
