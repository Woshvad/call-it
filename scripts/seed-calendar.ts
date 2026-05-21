/**
 * seed-calendar.ts — Google Calendar seeding for Stylus reactivation (D-13, Pitfall C)
 *
 * Usage:
 *   tsx scripts/seed-calendar.ts --setup
 *     One-time OAuth flow: grants Calendar API access, prints refresh token.
 *     Operator saves the token to GCP Secret Manager as GOOGLE_CALENDAR_OAUTH_TOKEN.
 *
 *   tsx scripts/seed-calendar.ts --placeholder-deploy-date 2026-08-21
 *     Creates 4 Google Calendar events at T-30d/T-15d/T-7d/T-1d before the placeholder date.
 *     Writes event IDs to packages/shared/src/constants/stylus-calendar.json.
 *
 *   tsx scripts/seed-calendar.ts --placeholder-deploy-date 2026-08-21 --dry-run
 *     Prints what WOULD be created without making API calls.
 *
 * Env vars:
 *   GOOGLE_CALENDAR_OAUTH_TOKEN  OAuth refresh token from --setup flow (stored in GCP Secret Manager)
 *   GOOGLE_CLIENT_ID             OAuth client ID from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET         OAuth client secret from Google Cloud Console
 *   GOOGLE_CALENDAR_ID           Calendar to create events in (default: 'primary')
 *   OPERATOR_EMAIL               Operator email for event attendees (optional)
 *
 * Phase 5 hook:
 *   After Stylus contract activation, run scripts/repoint-calendar.ts to update event dates
 *   to the REAL activation expiry (placeholder + 365 days).
 *   The stylus-deactivation-watcher (apps/relayer/src/workers/) is the independent second belt.
 *
 * Open Question 6 (resolved):
 *   Required OAuth scope: 'https://www.googleapis.com/auth/calendar.events'
 *   This allows creating + updating events but NOT deleting calendars.
 *   Tokens are refresh tokens (long-lived); store in GCP Secret Manager, NOT in env files.
 *
 * Security (T-00-34):
 *   OAuth token in GCP Secret Manager with IAM-bound access.
 *   Scope limited to calendar.events (not full Calendar admin).
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CALENDAR_JSON_PATH = path.join(REPO_ROOT, 'packages', 'shared', 'src', 'constants', 'stylus-calendar.json');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StylusCalendarJson {
  event_t30: string | null;
  event_t15: string | null;
  event_t7: string | null;
  event_t1: string | null;
  placeholder_deploy_date: string | null;
  created_at: string | null;
  last_updated_via: string | null;
  _note: string;
}

interface CalendarEvent {
  daysBeforeDeploy: 30 | 15 | 7 | 1;
  date: string;      // YYYY-MM-DD
  title: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date arithmetic
// ─────────────────────────────────────────────────────────────────────────────

function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function computeEventDates(placeholderDeployDate: string): CalendarEvent[] {
  const thresholds: Array<30 | 15 | 7 | 1> = [30, 15, 7, 1];
  return thresholds.map((days) => {
    const date = subtractDays(placeholderDeployDate, days);
    return {
      daysBeforeDeploy: days,
      date,
      title: `[T-${days}d] Stylus Reactivation — placeholder for ${placeholderDeployDate}`,
      description:
        `STYLUS REACTIVATION REMINDER (T-${days} days)\n\n` +
        `Placeholder deploy date: ${placeholderDeployDate}\n` +
        `This event's date will be updated by scripts/repoint-calendar.ts in Phase 5 once the real activation timestamp is known.\n\n` +
        `Runbook: https://github.com/call-it-xyz/call-it/blob/main/docs/runbooks/stylus-reactivation.md\n\n` +
        `The relayer's stylus-deactivation-watcher is the independent second belt — Telegram alerts will fire even if this calendar event is wrong.\n\n` +
        `REQUIRED ACTION: At this date, run:\n` +
        `  1. cargo stylus activate <STYLUS_SCORE_ENGINE_ADDRESS> --network arbitrum-one\n` +
        `  2. pnpm tsx scripts/repoint-calendar.ts --stylus-deploy-date <new-date>\n` +
        `  3. Verify: cast call <address> "arbitrumActivationExpiry()" (should be now + 365d)`,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar API client (using googleapis npm package)
// ─────────────────────────────────────────────────────────────────────────────

async function getCalendarClient() {
  const { google } = await import('googleapis');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_OAUTH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.\n' +
        'Get these from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.',
    );
  }
  if (!refreshToken) {
    throw new Error(
      'GOOGLE_CALENDAR_OAUTH_TOKEN not set.\n' +
        'Run: pnpm tsx scripts/seed-calendar.ts --setup\n' +
        'Then save the printed refresh token to GCP Secret Manager.',
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3333/callback');
  oauth2.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: 'v3', auth: oauth2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// --setup mode: one-time OAuth flow
// ─────────────────────────────────────────────────────────────────────────────

async function runSetup(): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set for --setup');
    console.error('Create OAuth 2.0 credentials in Google Cloud Console:');
    console.error('  1. Go to console.cloud.google.com → APIs & Services → Credentials');
    console.error('  2. Create OAuth 2.0 Client ID → Application type: Desktop App');
    console.error('  3. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment');
    process.exit(1);
  }

  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3333/callback');

  // Required scope: calendar.events (T-00-34 — minimal scope)
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent', // Force refresh token
  });

  console.log('\n=== Google Calendar OAuth Setup ===\n');
  console.log('1. Open this URL in your browser:');
  console.log(`\n${authUrl}\n`);
  console.log('2. Grant calendar.events access');
  console.log('3. You will be redirected to localhost:3333/callback\n');
  console.log('Waiting for OAuth callback on http://localhost:3333/callback ...\n');

  // Listen for the callback
  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost:3333');
      const code = url.searchParams.get('code');

      if (!code) {
        res.writeHead(400);
        res.end('No auth code found in callback URL');
        reject(new Error('No auth code in callback'));
        return;
      }

      try {
        const { tokens } = await oauth2.getToken(code);
        const refreshToken = tokens.refresh_token;

        if (!refreshToken) {
          res.writeHead(400);
          res.end('No refresh token in response. Try revoking access and re-running with --setup.');
          reject(new Error('No refresh token received'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful! Check your terminal.</h1><p>You can close this window.</p>');

        console.log('\n=== OAuth Setup Complete ===\n');
        console.log('Refresh token (save to GCP Secret Manager as GOOGLE_CALENDAR_OAUTH_TOKEN):');
        console.log(`\n${refreshToken}\n`);
        console.log('Run:');
        console.log(`  gcloud secrets create GOOGLE_CALENDAR_OAUTH_TOKEN --data-file=-`);
        console.log(`  # Paste: ${refreshToken}`);

        server.close();
        resolve();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500);
        res.end(`Error exchanging code: ${msg}`);
        reject(err);
      }
    });

    server.listen(3333);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Default mode: create 4 calendar events
// ─────────────────────────────────────────────────────────────────────────────

async function seedCalendar(placeholderDeployDate: string, dryRun: boolean): Promise<void> {
  const events = computeEventDates(placeholderDeployDate);

  console.log(`\n=== Stylus Reactivation Calendar Seeding ===`);
  console.log(`Placeholder deploy date: ${placeholderDeployDate}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no API calls)' : 'LIVE (creating events)'}\n`);

  for (const event of events) {
    console.log(`  T-${event.daysBeforeDeploy}d: ${event.date} — "${event.title}"`);
  }

  if (dryRun) {
    console.log('\nDRY RUN complete — no events created.\n');
    console.log('Run without --dry-run to actually create these events.');
    return;
  }

  const calendar = await getCalendarClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
  const operatorEmail = process.env.OPERATOR_EMAIL;

  const calendarJson: StylusCalendarJson = {
    event_t30: null,
    event_t15: null,
    event_t7: null,
    event_t1: null,
    placeholder_deploy_date: placeholderDeployDate,
    created_at: new Date().toISOString(),
    last_updated_via: 'seed',
    _note: 'Populated by scripts/seed-calendar.ts; updated by scripts/repoint-calendar.ts in Phase 5. Event IDs are Google Calendar event IDs for the 4 Stylus reactivation reminder events at T-30d/T-15d/T-7d/T-1d.',
  };

  console.log('\nCreating events...\n');

  for (const event of events) {
    const requestBody: Record<string, unknown> = {
      summary: event.title,
      description: event.description,
      start: { date: event.date },
      end: { date: event.date },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    if (operatorEmail) {
      requestBody.attendees = [{ email: operatorEmail }];
    }

    const response = await calendar.events.insert({
      calendarId,
      requestBody,
    });

    const eventId = response.data.id!;
    const key = `event_t${event.daysBeforeDeploy}` as keyof Pick<StylusCalendarJson, 'event_t30' | 'event_t15' | 'event_t7' | 'event_t1'>;
    calendarJson[key] = eventId;

    console.log(`  Created T-${event.daysBeforeDeploy}d event: ${eventId}`);
    console.log(`    Date: ${event.date}`);
    console.log(`    Title: ${event.title}\n`);
  }

  // Write to stylus-calendar.json
  writeFileSync(CALENDAR_JSON_PATH, JSON.stringify(calendarJson, null, 2));
  console.log(`\nEvent IDs written to: ${CALENDAR_JSON_PATH}`);
  console.log('\nNext step: Operator manually confirms 4 events appear in Google Calendar UI.');
  console.log('Phase 5: Run scripts/repoint-calendar.ts after Stylus activation to update dates.\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      setup: { type: 'boolean', default: false },
      'placeholder-deploy-date': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const isSetup = values.setup as boolean;
  const placeholderDeployDate = values['placeholder-deploy-date'] as string | undefined;
  const isDryRun = values['dry-run'] as boolean;

  if (isSetup) {
    await runSetup();
    return;
  }

  // Default mode: create events
  let deployDate = placeholderDeployDate;
  if (!deployDate) {
    // Default: 90 days from today
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 90);
    deployDate = date.toISOString().slice(0, 10);
    console.log(`No --placeholder-deploy-date specified. Using default: ${deployDate} (today + 90 days)`);
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deployDate)) {
    console.error(`Error: --placeholder-deploy-date must be YYYY-MM-DD format. Got: "${deployDate}"`);
    process.exit(1);
  }

  try {
    await seedCalendar(deployDate, isDryRun);
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
  (process.argv[1].endsWith('seed-calendar.ts') || process.argv[1].endsWith('seed-calendar.js'));

if (isMain) {
  main();
}
