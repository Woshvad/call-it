/**
 * Drizzle Kit configuration for the Call It relayer.
 *
 * Commands:
 *   pnpm --filter @call-it/relayer db:generate  — generate migration SQL from schema
 *   pnpm --filter @call-it/relayer db:migrate   — apply pending migrations to Fly Postgres
 *   pnpm --filter @call-it/relayer db:push      — push schema directly (dev only)
 *
 * Credentials: reads POSTGRES_URL from process.env (Fly secrets via GCP Secret Manager).
 * Never put a real connection string in this file.
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? 'postgresql://localhost:5432/call_it',
  },
  verbose: true,
  strict: true,
});
