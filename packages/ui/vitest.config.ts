import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['__tests__/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
    watch: false,
    environment: 'jsdom',
    setupFiles: ['__tests__/setup.ts'],
  },
});
