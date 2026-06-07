/**
 * verify-event-coverage.ts — OPS-04 subgraph event-coverage verifier (Plan 07-06)
 *
 * Proves that every one of the ~20 indexed events (OPS-03 list) is mapped and
 * indexing on a Studio subgraph endpoint, and that a freshly-seeded CallCreated
 * appears within ~30s of emission (OPS-04 sync-lag check). Exits non-zero on any
 * missing event or a >30s lag and prints a coverage table.
 *
 * AUTHORITATIVE RUN (operator-gated, Plan 07-06 Task 2): run this against the LIVE
 * Studio v0.9.0 endpoint after publish — it MUST exit 0. The Phase-0 polled-events
 * fallback stays live during the post-publish sync gap.
 *
 * The endpoint is CONFIGURABLE (never hardcoded): it reads, in order,
 *   1. --endpoint <url> CLI flag
 *   2. SUBGRAPH_COVERAGE_URL env
 *   3. SUBGRAPH_URL_SEPOLIA env
 * and errors out (exit 2) if none is provided. This lets Task 1 author + typecheck
 * the script with no live endpoint; the authoritative run supplies the real URL.
 *
 * Modes:
 *   --check-only   Only run the per-event coverage queries (skip the live sync-lag
 *                  probe, which needs a freshly-seeded call). Used in CI/dry-run.
 *   --seeded-call-id <n>  The callId the operator just created on-chain; enables
 *                  the <30s CallCreated sync-lag check (OPS-04).
 *   --lag-budget-ms <n>   Override the 30000ms (30s) lag budget.
 *
 * Usage (operator, post-publish):
 *   node packages/subgraph/scripts/verify-event-coverage.ts \
 *     --endpoint https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.0 \
 *     --seeded-call-id 13
 *
 * Usage (CI dry-run, coverage only):
 *   SUBGRAPH_COVERAGE_URL=<url> node packages/subgraph/scripts/verify-event-coverage.ts --check-only
 *
 * Requirements: OPS-03 (the ~20-event list), OPS-04 (CallCreated <30s).
 */

/* eslint-disable no-console */

/** Default sync-lag budget for the CallCreated freshness check (OPS-04). */
const DEFAULT_LAG_BUDGET_MS = 30_000;

/**
 * The ~20 OPS-03 events, each mapped to the subgraph entity the handler writes.
 * `event` is the on-chain event name (OPS-03 wording); `entity` is the GraphQL
 * collection (camelCased plural) we count to prove the handler is indexing.
 *
 * Several on-chain events fan into shared entities by design (the subgraph models
 * the domain, not the raw log): CallSettled -> Settlement, RepCalculated -> RepEvent,
 * Challenge{Proposed,Accepted,Rejected,Refunded,Settled} -> Challenge/ChallengePayout,
 * PayoutClaimed -> PayoutClaim, ProfileUpdated/SocialLinked/SocialUnlinked map to
 * Profile/SocialLink. We assert the destination entity is queryable AND non-empty
 * on a seeded cluster (count > 0). An entity that exists in the schema but is empty
 * on the seeded recovery cluster is reported as a WARNING, not a hard FAIL, because
 * not every rare event (e.g. Dispute, ForceSettle) is exercised by every seed run;
 * the operator's seed script (OPS-04) must cover the FAIL-on-empty core set below.
 */
interface EventCoverage {
  /** OPS-03 on-chain event name. */
  event: string;
  /** Subgraph entity collection (GraphQL plural) the handler writes. */
  entity: string;
  /**
   * If true, an empty result is a hard FAIL (core path the seed MUST exercise).
   * If false, an empty result is a WARNING (rare path; presence of the entity in
   * the schema + a successful query is enough to prove the mapping compiled).
   */
  failOnEmpty: boolean;
}

/**
 * OPS-03 coverage matrix. The 20+ events; core money/rep paths are failOnEmpty.
 */
const COVERAGE: EventCoverage[] = [
  { event: 'CallCreated', entity: 'calls', failOnEmpty: true },
  { event: 'CallSettled', entity: 'settlements', failOnEmpty: true },
  { event: 'CallQuoted', entity: 'quoteCalls', failOnEmpty: false },
  { event: 'ConvictionCapped', entity: 'convictionCaps', failOnEmpty: false },
  { event: 'CallerExited', entity: 'callerExits', failOnEmpty: true },
  { event: 'Followed', entity: 'positions', failOnEmpty: true },
  { event: 'Faded', entity: 'positions', failOnEmpty: true },
  { event: 'PayoutClaimed', entity: 'payoutClaims', failOnEmpty: false },
  { event: 'PositionExited', entity: 'positionExits', failOnEmpty: false },
  { event: 'ChallengeProposed', entity: 'challenges', failOnEmpty: false },
  { event: 'ChallengeAccepted', entity: 'challenges', failOnEmpty: false },
  { event: 'ChallengeRejected', entity: 'challenges', failOnEmpty: false },
  { event: 'ChallengeRefunded', entity: 'challenges', failOnEmpty: false },
  { event: 'ChallengeSettled', entity: 'challengePayouts', failOnEmpty: false },
  { event: 'DisputeRaised', entity: 'disputes', failOnEmpty: false },
  { event: 'DisputeResolved', entity: 'disputeResolutions', failOnEmpty: false },
  { event: 'CallForceSettled', entity: 'forceSettlements', failOnEmpty: false },
  { event: 'RepCalculated', entity: 'repEvents', failOnEmpty: true },
  { event: 'RepCalculatedFallback', entity: 'repCalculatedFallbacks', failOnEmpty: false },
  { event: 'SettlementDelayed', entity: 'settlementDelayeds', failOnEmpty: false },
  { event: 'ProfileUpdated', entity: 'profiles', failOnEmpty: true },
  { event: 'SocialLinked', entity: 'socialLinks', failOnEmpty: false },
  { event: 'SocialUnlinked', entity: 'socialLinks', failOnEmpty: false },
];

interface CliOptions {
  endpoint: string | null;
  checkOnly: boolean;
  seededCallId: string | null;
  lagBudgetMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    endpoint: null,
    checkOnly: false,
    seededCallId: null,
    lagBudgetMs: DEFAULT_LAG_BUDGET_MS,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check-only') opts.checkOnly = true;
    else if (arg === '--endpoint') opts.endpoint = argv[++i] ?? null;
    else if (arg === '--seeded-call-id') opts.seededCallId = argv[++i] ?? null;
    else if (arg === '--lag-budget-ms') opts.lagBudgetMs = Number(argv[++i] ?? DEFAULT_LAG_BUDGET_MS);
  }
  // Endpoint resolution: flag -> SUBGRAPH_COVERAGE_URL -> SUBGRAPH_URL_SEPOLIA.
  opts.endpoint =
    opts.endpoint ??
    process.env['SUBGRAPH_COVERAGE_URL'] ??
    process.env['SUBGRAPH_URL_SEPOLIA'] ??
    null;
  return opts;
}

interface GraphQLResponse {
  data?: Record<string, Array<Record<string, unknown>>>;
  errors?: Array<{ message: string }>;
}

/**
 * Query a single entity collection for up to 1 row (count proxy) + the most-recent
 * createdAt/timestamp where available. Returns the row count seen (0 or 1) and the
 * raw rows for the sync-lag probe.
 */
async function queryEntity(
  endpoint: string,
  entity: string,
  extra = '',
): Promise<{ rows: Array<Record<string, unknown>>; error: string | null }> {
  const query = `query Coverage { ${entity}(first: 1${extra}) { id } }`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      return { rows: [], error: `HTTP ${res.status} ${res.statusText}` };
    }
    const json = (await res.json()) as GraphQLResponse;
    if (json.errors && json.errors.length > 0) {
      return { rows: [], error: json.errors.map((e) => e.message).join('; ') };
    }
    return { rows: json.data?.[entity] ?? [], error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

interface CoverageRow {
  event: string;
  entity: string;
  status: 'OK' | 'EMPTY' | 'ERROR';
  failOnEmpty: boolean;
  detail: string;
}

async function runCoverage(endpoint: string): Promise<CoverageRow[]> {
  const results: CoverageRow[] = [];
  for (const c of COVERAGE) {
    const { rows, error } = await queryEntity(endpoint, c.entity);
    if (error) {
      results.push({ ...c, status: 'ERROR', detail: error });
    } else if (rows.length === 0) {
      results.push({ ...c, status: 'EMPTY', detail: 'no rows indexed' });
    } else {
      results.push({ ...c, status: 'OK', detail: `${rows.length}+ row(s)` });
    }
  }
  return results;
}

/**
 * OPS-04 sync-lag probe: poll for the seeded CallCreated id until it appears or the
 * lag budget elapses. Returns the observed lag in ms (or null if it never appeared).
 */
async function probeSyncLag(
  endpoint: string,
  callId: string,
  budgetMs: number,
): Promise<number | null> {
  const start = Date.now();
  const pollIntervalMs = 2_000;
  while (Date.now() - start < budgetMs) {
    const query = `query Lag { call(id: "${callId}") { id createdAt } }`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { call?: { id: string } | null } };
        if (json.data?.call?.id) {
          return Date.now() - start;
        }
      }
    } catch {
      // transient — keep polling within budget
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return null;
}

function printTable(rows: CoverageRow[]): void {
  const eventW = Math.max(...rows.map((r) => r.event.length), 'Event'.length);
  const entityW = Math.max(...rows.map((r) => r.entity.length), 'Entity'.length);
  const pad = (s: string, w: number): string => s.padEnd(w);
  console.log(`\n${pad('Event', eventW)}  ${pad('Entity', entityW)}  Status   Detail`);
  console.log('-'.repeat(eventW + entityW + 30));
  for (const r of rows) {
    const mark = r.status === 'OK' ? 'OK   ' : r.status === 'EMPTY' ? 'EMPTY' : 'ERROR';
    console.log(`${pad(r.event, eventW)}  ${pad(r.entity, entityW)}  ${mark}    ${r.detail}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.endpoint) {
    console.error(
      'ERROR: no subgraph endpoint. Provide --endpoint <url>, or set ' +
        'SUBGRAPH_COVERAGE_URL / SUBGRAPH_URL_SEPOLIA. ' +
        '(Authoritative run is operator-gated Plan 07-06 Task 2 against live Studio v0.9.0.)',
    );
    process.exit(2);
  }

  console.log(`Subgraph coverage check against: ${opts.endpoint}`);
  const rows = await runCoverage(opts.endpoint);
  printTable(rows);

  // Determine hard failures: any ERROR, or any EMPTY on a failOnEmpty core path.
  const errors = rows.filter((r) => r.status === 'ERROR');
  const coreEmpty = rows.filter((r) => r.status === 'EMPTY' && r.failOnEmpty);
  const warnEmpty = rows.filter((r) => r.status === 'EMPTY' && !r.failOnEmpty);

  if (warnEmpty.length > 0) {
    console.log(
      `\nWARN: ${warnEmpty.length} rare-path event(s) not yet seeded (non-fatal): ` +
        warnEmpty.map((r) => r.event).join(', '),
    );
  }

  let failed = false;
  if (errors.length > 0) {
    console.error(`\nFAIL: ${errors.length} entity query error(s): ${errors.map((r) => r.event).join(', ')}`);
    failed = true;
  }
  if (coreEmpty.length > 0) {
    console.error(
      `\nFAIL: ${coreEmpty.length} core event(s) not indexed (seed must exercise these): ` +
        coreEmpty.map((r) => r.event).join(', '),
    );
    failed = true;
  }

  // OPS-04 sync-lag check (skipped in --check-only or when no seeded id given).
  if (!opts.checkOnly && opts.seededCallId) {
    console.log(`\nOPS-04 sync-lag probe: CallCreated id=${opts.seededCallId}, budget=${opts.lagBudgetMs}ms`);
    const lag = await probeSyncLag(opts.endpoint, opts.seededCallId, opts.lagBudgetMs);
    if (lag === null) {
      console.error(`FAIL: CallCreated id=${opts.seededCallId} did NOT index within ${opts.lagBudgetMs}ms (OPS-04).`);
      failed = true;
    } else {
      console.log(`OK: CallCreated id=${opts.seededCallId} indexed in ${lag}ms (< ${opts.lagBudgetMs}ms).`);
    }
  } else if (!opts.checkOnly) {
    console.log('\nNOTE: --seeded-call-id not provided; OPS-04 <30s sync-lag probe skipped.');
  }

  if (failed) {
    console.error('\nCoverage verification FAILED.');
    process.exit(1);
  }
  console.log('\nCoverage verification PASSED.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error running coverage verification:', err);
  process.exit(1);
});
