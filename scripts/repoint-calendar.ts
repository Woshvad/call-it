/**
 * repoint-calendar.ts — Phase 5 hook to update Stylus reactivation calendar events
 *
 * // Phase 5 task: RUN THIS after Stylus contract activation. Failure to run = wrong calendar dates fire (Pitfall C).
 * // The deactivation watcher (apps/relayer/src/workers/stylus-deactivation-watcher.ts) is the second belt
 * // that catches this — Telegram alerts fire even if calendar is wrong.
 *
 * Usage:
 *   tsx scripts/repoint-calendar.ts --stylus-deploy-date 2027-03-15
 *     Updates the 4 calendar events to point to T-30d/T-15d/T-7d/T-1d before
 *     (stylus-deploy-date + 365 days) = the REAL reactivation deadline.
 *
 *   tsx scripts/repoint-calendar.ts --stylus-deploy-date 2027-03-15 --dry-run
 *     Prints what WOULD be updated without making API calls.
 *
 * Phase 5 prerequisite:
 *   1. Stylus contract deployed + activated (cargo stylus activate <address>)
 *   2. Run this script with the ACTUAL deploy date (the date cargo stylus activate succeeded)
 *   3. The script computes: reactivation_deadline = stylus_deploy_date + 365 days
 *   4. New event dates: T-30d/T-15d/T-7d/T-1d before reactivation_deadline
 *   5. Updates packages/shared/src/constants/stylus-calendar.json with new dates
 *
 * Env vars (same as seed-calendar.ts):
 *   GOOGLE_CALENDAR_OAUTH_TOKEN  OAuth refresh token from seed-calendar.ts --setup
 *   GOOGLE_CLIENT_ID             OAuth client ID
 *   GOOGLE_CLIENT_SECRET         OAuth client secret
 *   GOOGLE_CALENDAR_ID           Calendar ID (default: 'primary')
 *
 * Security (T-00-34):
 *   Uses calendar.events scope only — cannot delete calendars.
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CALENDAR_JSON_PATH = path.join(REPO_ROOT, 'packages', 'shared', 'src', 'constants', 'stylus-calendar.json');

// ─────────────────────────────────────────────────────────────────────────────
// Date arithmetic
// ─────────────────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function subtractDays(dateStr: string, days: number): string {
  return addDays(dateStr, -days);
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar API client
// ─────────────────────────────────────────────────────────────────────────────

async function getCalendarClient() {
  const { google } = await import('googleapis');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_OAUTH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALENDAR_OAUTH_TOKEN must be set.\n' +
        'Run scripts/seed-calendar.ts --setup to obtain the refresh token.',
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3333/callback');
  oauth2.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: 'v3', auth: oauth2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main repoint logic
// ─────────────────────────────────────────────────────────────────────────────

async function repointCalendar(stylusDeployDate: string, dryRun: boolean): Promise<void> {
  // Load existing event IDs from stylus-calendar.json
  let calendarJson: Record<string, unknown>;
  try {
    calendarJson = JSON.parse(readFileSync(CALENDAR_JSON_PATH, 'utf-8')) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Could not read ${CALENDAR_JSON_PATH}.\n` +
        'Run scripts/seed-calendar.ts first to create the initial events and populate this file.',
    );
  }

  const eventT30 = calendarJson.event_t30 as string | null;
  const eventT15 = calendarJson.event_t15 as string | null;
  const eventT7 = calendarJson.event_t7 as string | null;
  const eventT1 = calendarJson.event_t1 as string | null;

  if (!eventT30 || !eventT15 || !eventT7 || !eventT1) {
    throw new Error(
      'stylus-calendar.json does not contain all 4 event IDs.\n' +
        'Run scripts/seed-calendar.ts first to create initial events.',
    );
  }

  // Compute reactivation deadline = deploy date + 365 days
  const reactivationDeadline = addDays(stylusDeployDate, 365);

  // Compute new event dates
  const thresholds: Array<{ days: 30 | 15 | 7 | 1; eventId: string }> = [
    { days: 30, eventId: eventT30 },
    { days: 15, eventId: eventT15 },
    { days: 7, eventId: eventT7 },
    { days: 1, eventId: eventT1 },
  ];

  console.log('\n=== Stylus Reactivation Calendar Repoint (Phase 5) ===\n');
  console.log(`Stylus deploy date:        ${stylusDeployDate}`);
  console.log(`Reactivation deadline:     ${reactivationDeadline} (deploy + 365d)`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no API calls)' : 'LIVE (updating events)'}\n`);
  console.log('New event dates:');

  for (const { days } of thresholds) {
    const newDate = subtractDays(reactivationDeadline, days);
    console.log(`  T-${days}d: ${newDate}`);
  }

  if (dryRun) {
    console.log('\nDRY RUN complete — no events updated.\n');
    return;
  }

  const calendar = await getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? 'primary';

  console.log('\nUpdating events...\n');

  for (const { days, eventId } of thresholds) {
    const newDate = subtractDays(reactivationDeadline, days);
    const newTitle = `[T-${days}d] Stylus Reactivation — ${reactivationDeadline}`;
    const newDescription =
      `STYLUS REACTIVATION REMINDER (T-${days} days)\n\n` +
      `Stylus deploy date: ${stylusDeployDate}\n` +
      `Reactivation deadline: ${reactivationDeadline}\n` +
      `This event fires at T-${days}d (${newDate}) before the reactivation deadline.\n\n` +
      `Runbook: https://github.com/call-it-xyz/call-it/blob/main/docs/runbooks/stylus-reactivation.md\n\n` +
      `REQUIRED ACTION: Run:\n` +
      `  1. cargo stylus activate <STYLUS_SCORE_ENGINE_ADDRESS> --network arbitrum-one\n` +
      `  2. pnpm tsx scripts/repoint-calendar.ts --stylus-deploy-date <new-date>\n` +
      `  3. Verify: cast call <address> "arbitrumActivationExpiry()"`;

    // events.update() call — Phase 5 uses this to update existing event IDs
    await calendar.events.update({
      calendarId,
      eventId,
      requestBody: {
        summary: newTitle,
        description: newDescription,
        start: { date: newDate },
        end: { date: newDate },
      },
    });

    console.log(`  Updated T-${days}d event ${eventId}: ${newDate}`);
  }

  // Update stylus-calendar.json with new dates
  calendarJson.placeholder_deploy_date = reactivationDeadline;
  calendarJson.last_updated_via = 'phase-5-repoint';
  writeFileSync(CALENDAR_JSON_PATH, JSON.stringify(calendarJson, null, 2));

  console.log(`\nstylus-calendar.json updated with reactivation deadline: ${reactivationDeadline}`);
  console.log('\nPhase 5 repoint complete. The deactivation watcher provides the independent second belt.');
  console.log('Operator: please verify the 4 updated events in Google Calendar UI.\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'stylus-deploy-date': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const stylusDeployDate = values['stylus-deploy-date'] as string | undefined;
  const isDryRun = values['dry-run'] as boolean;

  if (!stylusDeployDate) {
    console.error('Error: --stylus-deploy-date YYYY-MM-DD is required');
    console.error('This should be the date cargo stylus activate succeeded for the StylusScoreEngine contract.');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stylusDeployDate)) {
    console.error(`Error: --stylus-deploy-date must be YYYY-MM-DD format. Got: "${stylusDeployDate}"`);
    process.exit(1);
  }

  try {
    await repointCalendar(stylusDeployDate, isDryRun);
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${msg}`);
    process.exit(1);
  }
}

// Only run main() when invoked directly
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('repoint-calendar.ts') || process.argv[1].endsWith('repoint-calendar.js'));

if (isMain) {
  main();
}
