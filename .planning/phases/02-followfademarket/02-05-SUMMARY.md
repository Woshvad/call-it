---
phase: 02-followfademarket
plan: 05
subsystem: relayer-db
status: complete
completed: 2026-05-30
tags: [drizzle, postgres, fly-postgres, migrations, notifications, quote-stance]

requires:
  - phase: 01-core-contracts-auth-frontend-skeleton
    provides: Fly Postgres (call-it-pg-sepolia) + Drizzle ORM + db client singleton

provides:
  - notifications table (D-13/D-14) — per-user in-app notifications, generic event_type
  - quote_stance table (D-15) — off-chain FOLLOWING/FADING annotation for quote calls
  - notifications_user_event_call_idx — UNIQUE (user_address, event_type, call_id) idempotency index (WR-05)

affects: [02-07-notification-fanout, 02-07-quote-stance-route, 02-09-notification-inbox]

key-files:
  created:
    - apps/relayer/src/db/migrations/0001_even_vertigo.sql
    - apps/relayer/src/db/migrations/0002_rich_blur.sql
  modified:
    - apps/relayer/src/db/schema.ts
    - apps/relayer/drizzle.config.ts

key-decisions:
  - "Generic event_type column on notifications — reused by Phase 3 (challenge_proposed) and Phase 4 (settlement_ready, payout_available) without schema changes (D-14)."
  - "WR-05 idempotency: UNIQUE (user_address, event_type, call_id) + ON CONFLICT DO NOTHING in the fan-out worker — a reprocessed CallerExited event cannot create duplicate notification rows."
  - "drizzle.config.ts hydrates POSTGRES_URL from .env.local / root .env via native process.loadEnvFile for local dev; CI/prod inject it directly (Fly secrets)."
---

# 02-05 — DB schema migration (notifications + quote_stance)

## What shipped

The relayer database schema foundation for Phase 2's caller-exit notifications
(D-13/D-14) and quote-call stance annotation (D-15), plus the WR-05 idempotency
index from the code-review fix pass.

**Task 1 — schema definitions** (committed `361ff9d`, WR-05 index added in `4c672ba`):
- `notifications` table: `id`, `user_address` (varchar 42), `event_type` (varchar 50),
  `call_id` (integer), `payload` (jsonb default `{}`), `created_at` (defaultNow),
  `read_at` (nullable). Indexes: `(user_address, read_at)`, `(user_address, created_at)`,
  and the WR-05 UNIQUE `(user_address, event_type, call_id)`.
- `quote_stance` table: `id`, `call_id`, `quote_call_id`, `stance` (varchar 10), `created_at`.
  Index: `(quote_call_id)`.

**Task 2 — generate + apply migration** (offline SQL: `fd3215b` + `4c672ba`):
- `0001_even_vertigo.sql` — CREATE TABLE notifications + quote_stance + their indexes.
- `0002_rich_blur.sql` — CREATE UNIQUE INDEX notifications_user_event_call_idx (WR-05).
- **Applied live to Fly Postgres** (`call-it-pg-sepolia`) on 2026-05-30 via
  `pnpm --filter @call-it/relayer db:migrate` through a `fly proxy` tunnel.

## Verification (live DB, post-migration)

```
TABLES: address_book, auth_methods, notifications, onboarding_state, quote_stance, drizzle_migrations
  notifications: YES | quote_stance: YES
notifications indexes: notifications_user_event_call_idx, notifications_user_read_idx,
                       notifications_user_time_idx, notifications_pkey
  WR-05 unique idx present: YES   |   is UNIQUE: YES
quote_stance cols: call_id, created_at, id, quote_call_id, stance
```

Both pending migrations (`0001`, `0002`) applied cleanly; drizzle journal records them.

## Notes / deviations

- The original deferred plan listed only `0001`; the WR-05 idempotency index (`0002`)
  was added during the code-review fix pass and applied in the same `db:migrate` run.
- Local-dev connection quirk on this machine: host port 5432 was occupied by an
  unrelated Docker container, so the tunnel + `POSTGRES_URL` were pointed at
  `127.0.0.1:5433` (`fly proxy 5433:5432 -a call-it-pg-sepolia`). This is a local
  convenience only — production/CI inject the real Fly `POSTGRES_URL`. A backup of
  the pre-edit `.env.local` is at `apps/relayer/.env.local.bak`.

## Self-Check: PASSED
- [x] notifications + quote_stance tables exist on Fly Postgres
- [x] WR-05 unique index present and UNIQUE
- [x] Migration SQL committed and drizzle journal updated
- [x] db:migrate exited 0
