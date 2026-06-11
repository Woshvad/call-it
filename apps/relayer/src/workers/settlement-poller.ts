/**
 * Redis-free chain-polling settlement poller (quick-260611-h36).
 *
 * WHY THIS EXISTS (LIVE OUTAGE response, 2026-06-11):
 *   - The BullMQ settlement pipeline is STRUCTURALLY INERT: `enqueueSettlement`
 *     has no producer anywhere in the codebase, index.ts's settlement
 *     walletClient is a throw-stub, and BullMQ needs the Upstash Redis whose
 *     free-tier quota is exhausted (500K/500K). Net effect: expired calls
 *     (e.g. call #15, ETH>=$2,300, expiring 2026-06-12 10:08 UTC) had NOTHING
 *     that would settle them.
 *   - This poller discovers calls by ASCENDING `getCall(id)` chain-polling —
 *     no Redis, no subgraph required for discovery (a nonexistent id returns a
 *     zeroed tuple, caller == zero address, no revert) — and settles expired
 *     Pyth price-target calls via `settlePythCall`.
 *
 * TRADEOFFS (accepted):
 *   - In-memory attempt counters / backoffs RESET ON RESTART: retries restart
 *     from 0 and the 30-attempt P0 alert may re-fire after a reboot. This is
 *     acceptable — losing a duplicate alert beats depending on dead Redis.
 *   - Single-machine assumption: the relayer is ONE Fly machine (fly.toml,
 *     auto_stop_machines=false), so in-process state cannot race a sibling.
 *
 * DoS guards (T-h36-06): MAX_PROBES_PER_TICK=50, terminal-id skip set,
 * expiry-aware candidate filter, 60s tick, fallback() RPC transport upstream.
 *
 * Architecture mirrors notification-fanout: `start… → { stop(), tick(),
 * getStats() }`, setInterval with a tick().catch safety net, per-call
 * try/catch so a tick can never throw.
 *
 * SECURITY (T-h36-01 + review WR-02): this module NEVER logs key material,
 * and upstream error text is scrubbed via sanitizeError() before logging —
 * viem's ContractFunctionExecutionError.message embeds the signer ACCOUNT
 * ADDRESS in its "Request Arguments" block (`from: 0x…`), so only the first
 * line of any error, with long 0x-hex runs truncated, ever reaches pino.
 * The walletClient arrives pre-built from index.ts.
 */

import type { PublicClient, WalletClient, Address } from 'viem';
import { HermesClient } from '@pythnetwork/hermes-client';
import { getLogger } from '../lib/logger.js';
import { sendAlertSafe } from './alerts.js';
import {
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
import { CALL_REGISTRY_ABI, ADAPTER_MAP_ABI } from './settlement-watcher.js';
import {
  PythAdapter,
  PythAdapterStatus,
  settlePythCall,
} from './oracle-adapters/pyth-adapter.js';
import { queryAcceptedChallengeIds } from '../lib/subgraph-client.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Failed-attempt cap before the P0 alert + backoff (mirrors SETTLE-10's 30). */
const MAX_ATTEMPTS = 30;

/** Backoff after the attempt cap (and re-armed per further failure): 10 min. */
const BACKOFF_MS = 600_000;

/**
 * Receipt-wait bound after a settle broadcast (WR-01). Beyond this the tx is
 * treated as UNCONFIRMED — the call is NOT marked terminal and is retried
 * next tick (the attempt counter / 30-cap P0 pathway is unchanged).
 */
const RECEIPT_TIMEOUT_MS = 120_000;

/** Successful-but-empty frontier ticks before the misconfig P1 fires (WR-06). */
const REGISTRY_STUCK_TICKS = 10;

/** Discovery bound per tick — caps RPC amplification on public RPC (T-h36-06). */
const MAX_PROBES_PER_TICK = 50;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// CallStatus ordinals (ICallRegistry.sol, verified via live-state.ts:125-128):
// Live=0, Settled=1, Disputed=2, CallerExited=3.
const STATUS_LIVE = 0;
const STATUS_SETTLED = 1;
const STATUS_DISPUTED = 2;
const STATUS_CALLER_EXITED = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SettlementPollerConfig {
  /** viem PublicClient for getCall / adapterMap reads. */
  publicClient: PublicClient;
  /**
   * Settlement signer client. ABSENT → IDLE dry-run mode: single P1 startup
   * alert + per-tick would-settle logs, zero transactions.
   */
  walletClient?: WalletClient;
  /** Override for CallRegistry address (default: Sepolia constant). */
  callRegistryAddress?: Address;
  /** Override for SettlementManager address (default: Sepolia constant). */
  settlementManagerAddress?: Address;
  /** Override for Hermes URL (default: mainnet Hermes). */
  hermesUrl?: string;
  /** Tick interval ms (default: SETTLEMENT_POLLER_INTERVAL_MS env or 60s). */
  intervalMs?: number;
}

export interface SettlementPollerHandle {
  /** Stop the polling interval. */
  stop(): void;
  /** Run a single tick (also used directly by tests — never throws). */
  tick(): Promise<void>;
  /** Diagnostic stats. */
  getStats(): {
    frontier: string;
    known: number;
    settled: number;
    errors: number;
    idle: boolean;
  };
}

interface KnownCall {
  expiry: bigint;
  status: number;
  marketType: number;
  eventSubtype: number;
  assetA: bigint;
  terminal: boolean;
}

interface CallStruct {
  caller: Address;
  expiry: bigint;
  marketType: number;
  eventSubtype: number;
  status: number;
  assetA: bigint;
}

/**
 * Scrub upstream error text before logging (WR-02): keep only the FIRST line
 * and truncate any long 0x-hex run (addresses, calldata, tx hashes). viem's
 * ContractFunctionExecutionError.message embeds the full "Request Arguments"
 * block — including `from: <signer account address>` — so logging err.message
 * verbatim would leak the signer ADDRESS into pino on every failed settle.
 * (Key material never appears in viem error text; this widens the logged-
 * invariant to the account address as the module header claims.)
 */
export function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const firstLine = (msg.split('\n')[0] ?? '').trim() || msg.slice(0, 200);
  return firstLine.replace(/0x[0-9a-fA-F]{10,}/g, (m) => `${m.slice(0, 10)}…`);
}

// ── Worker ────────────────────────────────────────────────────────────────────

export function startSettlementPoller(config: SettlementPollerConfig): SettlementPollerHandle {
  const logger = getLogger();
  const {
    publicClient,
    walletClient,
    callRegistryAddress = CALL_REGISTRY_ARBITRUM_SEPOLIA as Address,
    settlementManagerAddress = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as Address,
    hermesUrl = 'https://hermes.pyth.network',
    intervalMs = Number(process.env.SETTLEMENT_POLLER_INTERVAL_MS) || 60_000,
  } = config;

  // ── Module state (closure-scoped; resets on restart — see header) ──────────
  let frontier = 1n; // next unprobed call id
  const known = new Map<string, KnownCall>();
  const attempts = new Map<string, number>();
  const backoffUntil = new Map<string, number>();
  const skipLogged = new Set<string>();
  const alerted = new Set<string>();
  let totalSettled = 0;
  let totalErrors = 0;
  let running = false;

  // WR-06: registry sanity state — a wrong registry address / ABI drift makes
  // the chain look permanently empty, which is indistinguishable from "no
  // calls exist yet" (this repo HAS redeployed CallRegistry before — 05.1).
  // Alert once at startup (zeroed getCall(1)) and once more if the frontier
  // is still 1 after REGISTRY_STUCK_TICKS successful-but-empty probes.
  let emptyFrontierTicks = 0;
  let registryEmptyAlerted = false;
  let frontierStuckAlerted = false;

  // One Pyth adapter instance — mirrors the watcher's config exactly.
  const hermesClient = new HermesClient(hermesUrl, {});
  const pythAdapter = new PythAdapter(hermesClient, {
    maxRetries: 30,
    retryIntervalMs: 60_000,
    confidenceThresholdNumerator: 200, // SETTLE-08: confidence * 200 <= price
  });

  async function readCall(callId: bigint): Promise<CallStruct> {
    const raw = (await publicClient.readContract({
      address: callRegistryAddress,
      abi: CALL_REGISTRY_ABI,
      functionName: 'getCall',
      args: [callId],
    })) as unknown as Record<string, unknown>;
    return {
      caller: raw['caller'] as Address,
      expiry: (raw['expiry'] as bigint) ?? 0n,
      marketType: Number(raw['marketType']),
      eventSubtype: Number(raw['eventSubtype']),
      status: Number(raw['status']),
      assetA: (raw['assetA'] as bigint) ?? 0n,
    };
  }

  function recordKnown(idStr: string, call: CallStruct): void {
    known.set(idStr, {
      expiry: call.expiry,
      status: call.status,
      marketType: call.marketType,
      eventSubtype: call.eventSubtype,
      assetA: call.assetA,
      terminal: call.status === STATUS_SETTLED || call.status === STATUS_DISPUTED,
    });
  }

  function clearCounters(idStr: string): void {
    attempts.delete(idStr);
    backoffUntil.delete(idStr);
    skipLogged.delete(idStr);
  }

  /**
   * Record a failed settle attempt. On reaching the cap: P0 alert ONCE
   * (alerted guard) + arm the 10-min backoff; further failures re-arm the
   * backoff without re-alerting.
   */
  async function recordFailure(idStr: string, reason: string): Promise<void> {
    const count = (attempts.get(idStr) ?? 0) + 1;
    attempts.set(idStr, count);
    logger.warn(
      { event: 'settlement_poller_attempt_failed', callId: idStr, attempt: count, reason },
      `Settle attempt ${count}/${MAX_ATTEMPTS} failed for callId ${idStr}`,
    );
    if (count >= MAX_ATTEMPTS) {
      backoffUntil.set(idStr, Date.now() + BACKOFF_MS);
      if (!alerted.has(idStr)) {
        alerted.add(idStr);
        await sendAlertSafe('settle_failed', {
          callId: idStr,
          reason: 'poller_max_attempts',
          attempts: count,
        });
      }
    }
  }

  async function processCandidate(idStr: string): Promise<void> {
    const callId = BigInt(idStr);

    // Re-read to confirm STILL unsettled (someone may settle externally).
    const call = await readCall(callId);
    recordKnown(idStr, call);
    const info = known.get(idStr)!;
    if (info.terminal) {
      clearCounters(idStr);
      return;
    }

    // IDLE dry-run: no signer → loud per-candidate log, NO Hermes fetch, NO writes.
    if (!walletClient) {
      logger.warn(
        {
          event: 'settlement_poller_would_settle',
          callId: idStr,
          expiry: call.expiry.toString(),
          status: call.status,
        },
        `IDLE dry-run: callId ${idStr} is expired and WOULD be settled if a signer were configured`,
      );
      return;
    }

    // Adapter routing: only Pyth (0) is settleable by this poller.
    const adapterType = Number(await publicClient.readContract({
      address: settlementManagerAddress,
      abi: ADAPTER_MAP_ABI,
      functionName: 'adapterMap',
      args: [call.marketType, call.eventSubtype],
    }));
    if (adapterType !== 0) {
      if (!skipLogged.has(idStr)) {
        skipLogged.add(idStr);
        logger.warn(
          {
            event: 'settlement_poller_skip_non_pyth',
            callId: idStr,
            marketType: call.marketType,
            eventSubtype: call.eventSubtype,
            adapterType,
          },
          `Skipping non-Pyth callId ${idStr} (adapter ${adapterType}) — the criteria store is empty for these (known product gap); not alerting, not counting attempts`,
        );
      }
      return;
    }

    // Pyth settle: assetA encodes the feed id as uint256(bytes32(feedId)).
    const priceId = call.assetA.toString(16).padStart(64, '0');
    let updateData: `0x${string}`[];
    try {
      const fetchResult = await pythAdapter.fetchAndVerify({ priceId, callId });
      if (fetchResult.status !== PythAdapterStatus.Success) {
        // SettlementDelayed (wide confidence) / DisputeWindowOpened → attempt.
        await recordFailure(idStr, `pyth_${fetchResult.status}`);
        return;
      }
      updateData = fetchResult.updateData ?? [];
    } catch (err) {
      await recordFailure(idStr, sanitizeError(err));
      return;
    }

    // Challenge ids through the breaker — [] fallback (subgraph is untrusted
    // input; SettlementManager validates each id on-chain via ce.getChallenge).
    const acceptedChallengeIds = await queryAcceptedChallengeIds(callId).catch((err: unknown) => {
      logger.warn(
        {
          event: 'settlement_poller_challenge_ids_failed',
          callId: idStr,
          err: sanitizeError(err),
        },
        'queryAcceptedChallengeIds failed — settling with [] (no duels settled for this call)',
      );
      return [] as bigint[];
    });

    try {
      const txHash = await settlePythCall({
        callId,
        updateData,
        acceptedChallengeIds,
        walletClient,
        publicClient,
        settlementManagerAddress,
      });

      // WR-01: a broadcast hash is NOT proof of settlement. viem's implicit
      // gas estimation catches most reverts pre-broadcast, but an external
      // settle (or price-update) landing between estimation and inclusion
      // yields a MINED-BUT-REVERTED tx. Wait for the receipt (publicClient
      // rides the fallback() RPC transport built in index.ts) and only mark
      // terminal on an actual on-chain success — anything else re-enters the
      // retry loop (and the unchanged 30-cap P0 pathway) instead of being
      // silently abandoned until restart.
      let receiptStatus: string;
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: RECEIPT_TIMEOUT_MS,
        });
        receiptStatus = receipt.status;
      } catch (waitErr) {
        logger.error(
          {
            event: 'settlement_poller_receipt_wait_failed',
            callId: idStr,
            txHash,
            err: sanitizeError(waitErr),
          },
          `Receipt wait failed/timed out for callId ${idStr} settle tx — NOT marking terminal; retrying next tick`,
        );
        await recordFailure(idStr, 'receipt_wait_failed');
        return;
      }
      if (receiptStatus !== 'success') {
        logger.error(
          {
            event: 'settlement_poller_tx_reverted',
            callId: idStr,
            txHash,
            receiptStatus,
          },
          `Settle tx for callId ${idStr} mined but REVERTED — NOT marking terminal; retrying next tick`,
        );
        await recordFailure(idStr, 'tx_reverted');
        return;
      }

      logger.info(
        { event: 'settlement_poller_settled', callId: idStr, txHash },
        `Settled callId ${idStr} (receipt confirmed)`,
      );
      totalSettled++;
      info.terminal = true;
      clearCounters(idStr);
    } catch (err) {
      await recordFailure(idStr, sanitizeError(err));
    }
  }

  /**
   * WR-06: startup sanity probe — getCall(1) returning the zeroed tuple while
   * a registry address is configured is either a brand-new registry or a
   * misconfig (wrong address / ABI drift decoding caller as zero). Log loudly
   * + single infra P1 so an unattended poller can never be structurally blind
   * while looking healthy. Fire-and-forget; never throws.
   */
  async function registrySanityProbe(): Promise<void> {
    if (callRegistryAddress.toLowerCase() === ZERO_ADDRESS) return;
    try {
      const probe = await readCall(1n);
      if (probe.caller.toLowerCase() === ZERO_ADDRESS && !registryEmptyAlerted) {
        registryEmptyAlerted = true;
        logger.error(
          { event: 'settlement_poller_registry_probe_zero', callRegistryAddress },
          'Registry probe found zero calls — address/ABI misconfig? (or a brand-new registry)',
        );
        await sendAlertSafe('tvl_approach', {
          category: 'infra',
          subsystem: 'settlement-poller',
          probe: 'registry_empty',
          callRegistryAddress,
          message: 'registry probe found zero calls — address/ABI misconfig?',
        });
      }
    } catch (err) {
      // An RPC failure at boot is NOT a misconfig signal — per-tick discovery retries.
      logger.warn(
        { event: 'settlement_poller_registry_probe_failed', err: sanitizeError(err) },
        'Registry sanity probe failed — relying on per-tick discovery',
      );
    }
  }

  async function tick(): Promise<void> {
    if (running) return; // never overlap ticks
    running = true;
    try {
      // ── 1. Discover (no subgraph): ascending getCall until the zeroed tuple ─
      let probes = 0;
      let sawEmptyFrontier = false; // WR-06: zeroed tuple at id 1 (successful probe)
      while (probes < MAX_PROBES_PER_TICK) {
        let call: CallStruct;
        try {
          call = await readCall(frontier);
        } catch (err) {
          logger.warn(
            {
              event: 'settlement_poller_probe_failed',
              callId: frontier.toString(),
              err: sanitizeError(err),
            },
            'getCall probe failed — retrying next tick',
          );
          totalErrors++;
          break;
        }
        probes++;
        if (call.caller.toLowerCase() === ZERO_ADDRESS) {
          // VERIFIED: a nonexistent id returns a zeroed tuple, no revert.
          if (frontier === 1n) sawEmptyFrontier = true;
          break;
        }
        recordKnown(frontier.toString(), call);
        frontier++;
      }

      // ── 1b. WR-06: frontier never advanced past 1 across many SUCCESSFUL
      // probes while a registry address is configured → likely misconfig
      // (wrong address / ABI drift). RPC failures do NOT count. Alert once.
      if (sawEmptyFrontier && callRegistryAddress.toLowerCase() !== ZERO_ADDRESS) {
        emptyFrontierTicks++;
        if (emptyFrontierTicks >= REGISTRY_STUCK_TICKS && !frontierStuckAlerted) {
          frontierStuckAlerted = true;
          logger.error(
            {
              event: 'settlement_poller_frontier_stuck',
              ticks: emptyFrontierTicks,
              callRegistryAddress,
            },
            `Frontier still at call id 1 after ${emptyFrontierTicks} ticks with a configured registry — address/ABI misconfig?`,
          );
          await sendAlertSafe('tvl_approach', {
            category: 'infra',
            subsystem: 'settlement-poller',
            probe: 'frontier_stuck',
            ticks: emptyFrontierTicks,
            callRegistryAddress,
            message: `settlement-poller frontier stuck at 1 after ${emptyFrontierTicks} ticks — registry address/ABI misconfig?`,
          });
        }
      }

      // ── 2. Candidates: expired, non-terminal, Live/CallerExited, not backing off ─
      const now = Date.now();
      const candidates: string[] = [];
      for (const [idStr, info] of known) {
        if (info.terminal) continue;
        if (info.status !== STATUS_LIVE && info.status !== STATUS_CALLER_EXITED) continue;
        if (now < Number(info.expiry) * 1000) continue;
        if (now < (backoffUntil.get(idStr) ?? 0)) continue;
        candidates.push(idStr);
      }

      // ── 3-5. Per-candidate processing (a failure never kills the tick) ──────
      for (const idStr of candidates) {
        try {
          await processCandidate(idStr);
        } catch (err) {
          totalErrors++;
          logger.error(
            {
              event: 'settlement_poller_candidate_error',
              callId: idStr,
              err: sanitizeError(err),
            },
            'Candidate processing failed — continuing',
          );
        }
      }
    } finally {
      running = false;
    }
  }

  // ── Startup ──────────────────────────────────────────────────────────────────
  if (!walletClient) {
    logger.warn(
      { event: 'settlement_poller_idle_mode' },
      'SETTLEMENT_SIGNER_PRIVATE_KEY absent — settlement-poller running IDLE (dry-run only): expired calls will NOT be settled',
    );
    // Single P1 alert via the existing infra-payload pattern (index.ts:366) —
    // AlertEvent union and test/alerts.test.ts stay untouched.
    void sendAlertSafe('tvl_approach', {
      category: 'infra',
      subsystem: 'settlement-poller',
      message:
        'poller IDLE: no settlement signer configured — expired calls will NOT be settled. Set the SETTLEMENT_SIGNER_PRIVATE_KEY Fly secret to enable live settlement.',
    });
  }

  // WR-06: fire-and-forget startup registry sanity probe (never throws).
  void registrySanityProbe();

  logger.info(
    { event: 'settlement_poller_started', intervalMs, idle: !walletClient },
    `Settlement poller started (${walletClient ? 'LIVE' : 'IDLE dry-run'} mode, tick every ${intervalMs}ms)`,
  );

  const interval = setInterval(() => {
    tick().catch((err: unknown) => {
      totalErrors++;
      logger.error(
        { event: 'settlement_poller_tick_error', err: sanitizeError(err) },
        'Settlement poller tick threw — continuing',
      );
    });
  }, intervalMs);

  return {
    stop(): void {
      clearInterval(interval);
      logger.info({ event: 'settlement_poller_stopped' }, 'Settlement poller stopped');
    },
    tick,
    getStats() {
      return {
        frontier: frontier.toString(),
        known: known.size,
        settled: totalSettled,
        errors: totalErrors,
        idle: !walletClient,
      };
    },
  };
}
