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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// Local-dev convenience: hydrate process.env from env files when the variable is
// not already provided by the real environment. CI/production inject POSTGRES_URL
// directly (Fly secrets via GCP Secret Manager) — that path is untouched because
// this block is skipped whenever POSTGRES_URL is already set. Uses Node's native
// process.loadEnvFile (Node >=20.12) — no dotenv dependency. Checks the relayer's
// own .env.local first, then the monorepo-root .env. Never throws.
if (!process.env.POSTGRES_URL) {
  for (const envPath of ['.env.local', resolve(process.cwd(), '../../.env')]) {
    if (existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        if (process.env.POSTGRES_URL) break;
      } catch {
        /* ignore — fall through to the next candidate / process.env */
      }
    }
  }
}

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
