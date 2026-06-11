/**
 * chain-scanner.test.ts — quick-260611-o5b RED→GREEN for the shared chain scanner.
 *
 * Pins the Alchemy-CU-burn fix contract:
 *   - ONE merged multi-address/multi-event getLogs per window (never per-registration)
 *   - 500-block default span with the CHAIN_SCANNER_* > NOTIFICATION_FANOUT_* > default
 *     env fallback ladder (span 500 / maxWindowsPerTick 50)
 *   - window chunking math + cursor advancement
 *   - dispatch ONLY on exact (registered address, registered event) pairs (T-o5b-01);
 *     cross-product noise dropped; case-insensitive address match
 *   - WR-05 init guard: never scan from block 1; re-seed from head, skip that tick (T-o5b-04)
 *   - getLogs failure does NOT advance the cursor; handler throws are isolated
 *   - maxWindowsPerTick cap + catching-up log (T-o5b-02)
 *   - onTick callbacks: every initialized tick + the get_head-failure path; never un-seeded
 *   - stop() clears the interval and makes further ticks no-ops
 *   - unregister shrinks the merged filter and silences the handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseAbiItem, type Log, type PublicClient } from 'viem';
import { createChainScanner, type ChainScannerHandle, type LogSubscription } from '../chain-scanner.js';
import { startNotificationFanout, type NotificationFanoutConfig } from '../notification-fanout.js';
import { startSocialUnlinkWatcher, type SocialUnlinkWatcherConfig } from '../social-unlink-watcher.js';
import { startAutoPostWorker, type AutoPostWorkerConfig } from '../auto-post-worker.js';

// ── Logger mock (assert log taxonomy without real pino) ────────────────────────
const logMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: logMock,
  getLogger: () => logMock,
}));

// ── Fixtures ────────────────────────────────────────────────────────────────────

const ADDR_A = '0x00000000000000000000000000000000000000aa' as const;
const ADDR_B = '0x00000000000000000000000000000000000000bb' as const;
const ADDR_C = '0x00000000000000000000000000000000000000cc' as const;

const EVENT_X = parseAbiItem('event EventX(uint256 indexed id)');
const EVENT_Y = parseAbiItem('event EventY(uint256 indexed id)');
const EVENT_Z = parseAbiItem('event EventZ(uint256 indexed id)');

/** Fabricate a decoded viem log as getLogs-with-events returns it. */
function fakeLog(address: string, eventName: string, blockNumber = 0n): Log {
  return {
    address,
    eventName,
    args: { id: 1n },
    blockNumber,
    logIndex: 0,
  } as unknown as Log;
}

function makeClient(opts?: {
  getBlockNumber?: ReturnType<typeof vi.fn>;
  getLogs?: ReturnType<typeof vi.fn>;
}): {
  publicClient: PublicClient;
  getBlockNumber: ReturnType<typeof vi.fn>;
  getLogs: ReturnType<typeof vi.fn>;
} {
  const getBlockNumber = opts?.getBlockNumber ?? vi.fn().mockResolvedValue(1000n);
  const getLogs = opts?.getLogs ?? vi.fn().mockResolvedValue([]);
  return {
    publicClient: { getBlockNumber, getLogs } as unknown as PublicClient,
    getBlockNumber,
    getLogs,
  };
}

const ENV_KEYS = [
  'CHAIN_SCANNER_BLOCK_SPAN',
  'NOTIFICATION_FANOUT_BLOCK_SPAN',
  'CHAIN_SCANNER_MAX_WINDOWS_PER_TICK',
  'NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK',
] as const;
let savedEnv: Record<string, string | undefined> = {};

/** Assert WR-05's hard floor: no getLogs call may ever start at block 0/1. */
function assertNoGenesisScan(getLogs: ReturnType<typeof vi.fn>): void {
  for (const call of getLogs.mock.calls) {
    const fromBlock = (call[0] as { fromBlock: bigint }).fromBlock;
    expect(fromBlock).not.toBe(0n);
    expect(fromBlock).not.toBe(1n);
  }
}

describe('chain-scanner (quick-260611-o5b)', () => {
  let scanner: ChainScannerHandle | undefined;

  beforeEach(() => {
    savedEnv = {};
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    scanner?.stop();
    scanner = undefined;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  // ── Window chunking math ───────────────────────────────────────────────────────
  it('chunks the head gap into span-sized windows and advances the cursor to head', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(1000n); // init seed
    getBlockNumber.mockResolvedValueOnce(2234n); // tick head (= 1000n + 1234n)

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 500n });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
    scanner.start();
    await scanner.tickNow();

    expect(getLogs).toHaveBeenCalledTimes(3);
    const windows = getLogs.mock.calls.map((c) => {
      const p = c[0] as { fromBlock: bigint; toBlock: bigint };
      return [p.fromBlock, p.toBlock];
    });
    expect(windows).toEqual([
      [1001n, 1500n],
      [1501n, 2000n],
      [2001n, 2234n],
    ]);
    expect(scanner.getStats().lastBlockSeen).toBe(2234n);
    assertNoGenesisScan(getLogs);
  });

  // ── Single merged call shape ───────────────────────────────────────────────────
  it('issues ONE merged getLogs per window carrying all registered addresses and events', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(1000n);
    getBlockNumber.mockResolvedValueOnce(1100n);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 500n });
    scanner.register({ name: 'a', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
    scanner.register({ name: 'b', address: ADDR_B, event: EVENT_Y, onLog: async () => undefined });
    scanner.register({ name: 'c', address: ADDR_C, event: EVENT_Z, onLog: async () => undefined });
    scanner.start();
    await scanner.tickNow();

    // 100-block gap < 500 span → exactly ONE window → ONE getLogs (never 3)
    expect(getLogs).toHaveBeenCalledTimes(1);
    const params = getLogs.mock.calls[0]![0] as { address: string[]; events: unknown[] };
    expect(params.address).toHaveLength(3);
    expect(params.address.map((a) => a.toLowerCase())).toEqual(
      expect.arrayContaining([ADDR_A, ADDR_B, ADDR_C]),
    );
    expect(params.events).toHaveLength(3);
    expect(params.events).toEqual(expect.arrayContaining([EVENT_X, EVENT_Y, EVENT_Z]));
  });

  // ── Dispatch by (address, event) — T-o5b-01 ───────────────────────────────────
  it('dispatches each log only to the matching (address, event) registration and drops cross-product noise', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(1000n);
    getBlockNumber.mockResolvedValueOnce(1010n);
    // Mixed-case address on the X log pins case-insensitive dispatch.
    const logAX = fakeLog('0x00000000000000000000000000000000000000AA', 'EventX', 1001n);
    const logBY = fakeLog(ADDR_B, 'EventY', 1002n);
    const noiseAY = fakeLog(ADDR_A, 'EventY', 1003n); // cross-product noise — must be dropped
    getLogs.mockResolvedValueOnce([logAX, logBY, noiseAY]);

    const handlerX = vi.fn().mockResolvedValue(undefined);
    const handlerY = vi.fn().mockResolvedValue(undefined);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 500n });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: handlerX });
    scanner.register({ name: 'y', address: ADDR_B, event: EVENT_Y, onLog: handlerY });
    scanner.start();
    await scanner.tickNow();

    expect(handlerX).toHaveBeenCalledTimes(1);
    expect(handlerX).toHaveBeenCalledWith(logAX);
    expect(handlerY).toHaveBeenCalledTimes(1);
    expect(handlerY).toHaveBeenCalledWith(logBY);
  });

  // ── WR-05 init guard — T-o5b-04 ───────────────────────────────────────────────
  it('never scans from block 1: failed init re-seeds from head next tick and skips scanning that tick', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockRejectedValueOnce(new Error('rpc down')); // init fails
    getBlockNumber.mockResolvedValueOnce(5000n); // tick 1 re-seed
    getBlockNumber.mockResolvedValueOnce(5010n); // tick 2 head

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 500n });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
    scanner.start();

    // Tick 1: re-seeds, SKIPS scanning (init_recovered semantics) — no getLogs.
    await scanner.tickNow();
    expect(getLogs).not.toHaveBeenCalled();
    expect(scanner.getStats().initialized).toBe(true);
    expect(scanner.getStats().lastBlockSeen).toBe(5000n);
    expect(
      logMock.info.mock.calls.some((c) => (c[0] as { event?: string })?.event === 'chain_scanner_init_recovered'),
    ).toBe(true);

    // Tick 2: scans from 5001n — never from genesis.
    await scanner.tickNow();
    expect(getLogs).toHaveBeenCalledTimes(1);
    const params = getLogs.mock.calls[0]![0] as { fromBlock: bigint; toBlock: bigint };
    expect(params.fromBlock).toBe(5001n);
    expect(params.toBlock).toBe(5010n);
    assertNoGenesisScan(getLogs);
  });

  // ── getLogs failure resilience ─────────────────────────────────────────────────
  it('does NOT advance the cursor when getLogs fails — same window retried next tick', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(1000n); // init
    getBlockNumber.mockResolvedValueOnce(1100n); // tick 1 head
    getBlockNumber.mockResolvedValueOnce(1100n); // tick 2 head
    getLogs.mockRejectedValueOnce(new Error('429'));
    getLogs.mockResolvedValueOnce([]);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 500n });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
    scanner.start();

    await scanner.tickNow(); // getLogs rejects — must not throw, must not advance
    expect(scanner.getStats().lastBlockSeen).toBe(1000n);
    expect(scanner.getStats().errors).toBeGreaterThanOrEqual(1);

    await scanner.tickNow(); // retry of the SAME window
    expect(getLogs).toHaveBeenCalledTimes(2);
    const retry = getLogs.mock.calls[1]![0] as { fromBlock: bigint; toBlock: bigint };
    expect(retry.fromBlock).toBe(1001n); // identical window retried
    expect(scanner.getStats().lastBlockSeen).toBe(1100n);
  });

  // ── Handler error isolation ────────────────────────────────────────────────────
  it('isolates a throwing handler: later logs still dispatch, the window still advances', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(1000n);
    getBlockNumber.mockResolvedValueOnce(1010n);
    getLogs.mockResolvedValueOnce([
      fakeLog(ADDR_A, 'EventX', 1001n),
      fakeLog(ADDR_B, 'EventY', 1002n),
    ]);

    const handlerX = vi.fn().mockRejectedValue(new Error('boom'));
    const handlerY = vi.fn().mockResolvedValue(undefined);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 500n });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: handlerX });
    scanner.register({ name: 'y', address: ADDR_B, event: EVENT_Y, onLog: handlerY });
    scanner.start();

    await expect(scanner.tickNow()).resolves.toBeUndefined(); // nothing propagates
    expect(handlerX).toHaveBeenCalledTimes(1);
    expect(handlerY).toHaveBeenCalledTimes(1); // later log still dispatched
    expect(scanner.getStats().lastBlockSeen).toBe(1010n); // window advanced
    expect(scanner.getStats().errors).toBeGreaterThanOrEqual(1);
  });

  // ── maxWindowsPerTick cap — T-o5b-02 ──────────────────────────────────────────
  it('caps per-tick windows and logs catching_up when a backlog remains', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(10_000n); // init
    getBlockNumber.mockResolvedValueOnce(11_000n); // head = cursor + 1000n

    scanner = createChainScanner({
      publicClient,
      intervalMs: 1_000_000,
      blockSpan: 10n,
      maxWindowsPerTick: 50,
    });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
    scanner.start();
    await scanner.tickNow();

    expect(getLogs).toHaveBeenCalledTimes(50); // exactly the cap
    expect(scanner.getStats().lastBlockSeen).toBe(10_500n); // advanced by exactly 50 × 10
    expect(
      logMock.info.mock.calls.some((c) => (c[0] as { event?: string })?.event === 'chain_scanner_catching_up'),
    ).toBe(true);
  });

  // ── onTick callbacks ───────────────────────────────────────────────────────────
  it('runs onTick callbacks at the end of every initialized tick', async () => {
    const { publicClient, getBlockNumber } = makeClient();
    getBlockNumber.mockResolvedValue(1000n);
    const cb = vi.fn().mockResolvedValue(undefined);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000 });
    scanner.onTick('cb', cb);
    scanner.start();
    await scanner.tickNow();
    await scanner.tickNow();

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('runs onTick callbacks even when the per-tick head fetch fails', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(1000n); // init OK
    getBlockNumber.mockRejectedValueOnce(new Error('head down')); // tick head fails
    const cb = vi.fn().mockResolvedValue(undefined);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000 });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
    scanner.onTick('cb', cb);
    scanner.start();
    await scanner.tickNow();

    expect(getLogs).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledTimes(1); // get_head-failure path still ran callbacks
  });

  it('does NOT run onTick callbacks while the scanner is un-seeded', async () => {
    const { publicClient, getBlockNumber } = makeClient();
    getBlockNumber.mockRejectedValue(new Error('rpc down')); // init AND re-seed fail
    const cb = vi.fn().mockResolvedValue(undefined);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000 });
    scanner.onTick('cb', cb);
    scanner.start();
    await scanner.tickNow();

    expect(cb).not.toHaveBeenCalled();
  });

  it('catches and logs a throwing onTick callback — other callbacks still run', async () => {
    const { publicClient, getBlockNumber } = makeClient();
    getBlockNumber.mockResolvedValue(1000n);
    const bad = vi.fn().mockRejectedValue(new Error('cb boom'));
    const good = vi.fn().mockResolvedValue(undefined);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000 });
    scanner.onTick('bad', bad);
    scanner.onTick('good', good);
    scanner.start();

    await expect(scanner.tickNow()).resolves.toBeUndefined();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(
      logMock.error.mock.calls.some((c) => (c[0] as { event?: string })?.event === 'chain_scanner_error'),
    ).toBe(true);
  });

  // ── stop() ─────────────────────────────────────────────────────────────────────
  it('stop() clears the interval and makes a subsequent manual tick a no-op', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValue(2000n);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000 });
    scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
    scanner.start();
    scanner.stop();
    await scanner.tickNow();

    expect(getLogs).not.toHaveBeenCalled();
  });

  // ── Unregister ─────────────────────────────────────────────────────────────────
  it('unregister shrinks the merged filter and stops dispatching to the removed handler', async () => {
    const { publicClient, getBlockNumber, getLogs } = makeClient();
    getBlockNumber.mockResolvedValueOnce(1000n);
    getBlockNumber.mockResolvedValueOnce(1010n);
    getBlockNumber.mockResolvedValueOnce(1020n);
    getLogs.mockResolvedValue([fakeLog(ADDR_A, 'EventX', 1005n)]);

    const handlerX = vi.fn().mockResolvedValue(undefined);
    const handlerY = vi.fn().mockResolvedValue(undefined);

    scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 500n });
    const unregisterX = scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: handlerX });
    scanner.register({ name: 'y', address: ADDR_B, event: EVENT_Y, onLog: handlerY });
    scanner.start();

    await scanner.tickNow();
    expect(handlerX).toHaveBeenCalledTimes(1);

    unregisterX();
    await scanner.tickNow();

    expect(handlerX).toHaveBeenCalledTimes(1); // no further dispatch
    const params = getLogs.mock.calls[1]![0] as { address: string[]; events: unknown[] };
    expect(params.address.map((a) => a.toLowerCase())).toEqual([ADDR_B]);
    expect(params.events).toEqual([EVENT_Y]);
  });

  // ── Env fallback ladder (span) ─────────────────────────────────────────────────
  describe('env fallback ladder', () => {
    /** Drive one tick with a 299-block gap and return the first getLogs window size. */
    async function firstWindowSpan(): Promise<bigint> {
      const { publicClient, getBlockNumber, getLogs } = makeClient();
      getBlockNumber.mockResolvedValueOnce(1000n);
      getBlockNumber.mockResolvedValueOnce(1300n);
      scanner = createChainScanner({ publicClient, intervalMs: 1_000_000 });
      scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
      scanner.start();
      await scanner.tickNow();
      const p = getLogs.mock.calls[0]![0] as { fromBlock: bigint; toBlock: bigint };
      const span = p.toBlock - p.fromBlock + 1n;
      scanner.stop();
      scanner = undefined;
      return span;
    }

    it('CHAIN_SCANNER_BLOCK_SPAN wins over NOTIFICATION_FANOUT_BLOCK_SPAN', async () => {
      process.env.CHAIN_SCANNER_BLOCK_SPAN = '123';
      process.env.NOTIFICATION_FANOUT_BLOCK_SPAN = '77';
      expect(await firstWindowSpan()).toBe(123n);
    });

    it('falls back to NOTIFICATION_FANOUT_BLOCK_SPAN when CHAIN_SCANNER_BLOCK_SPAN is unset', async () => {
      process.env.NOTIFICATION_FANOUT_BLOCK_SPAN = '77';
      expect(await firstWindowSpan()).toBe(77n);
    });

    it('defaults to 500 blocks when neither env is set', async () => {
      // 299-block gap < 500 → single window covering the whole gap
      expect(await firstWindowSpan()).toBe(300n);
    });

    it('invalid CHAIN_SCANNER_BLOCK_SPAN falls through the ladder', async () => {
      process.env.CHAIN_SCANNER_BLOCK_SPAN = 'abc';
      process.env.NOTIFICATION_FANOUT_BLOCK_SPAN = '77';
      expect(await firstWindowSpan()).toBe(77n);
    });

    it('zero CHAIN_SCANNER_BLOCK_SPAN falls through to the 500 default when fanout env is unset too', async () => {
      process.env.CHAIN_SCANNER_BLOCK_SPAN = '0';
      expect(await firstWindowSpan()).toBe(300n); // 500 span > 299 gap → one window
    });

    /** Drive one tick with span 10 and a 1000-block gap; return getLogs call count. */
    async function windowsIssued(): Promise<number> {
      const { publicClient, getBlockNumber, getLogs } = makeClient();
      getBlockNumber.mockResolvedValueOnce(1000n);
      getBlockNumber.mockResolvedValueOnce(2000n);
      scanner = createChainScanner({ publicClient, intervalMs: 1_000_000, blockSpan: 10n });
      scanner.register({ name: 'x', address: ADDR_A, event: EVENT_X, onLog: async () => undefined });
      scanner.start();
      await scanner.tickNow();
      const count = getLogs.mock.calls.length;
      scanner.stop();
      scanner = undefined;
      return count;
    }

    it('CHAIN_SCANNER_MAX_WINDOWS_PER_TICK wins over NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK', async () => {
      process.env.CHAIN_SCANNER_MAX_WINDOWS_PER_TICK = '2';
      process.env.NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK = '7';
      expect(await windowsIssued()).toBe(2);
    });

    it('falls back to NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK', async () => {
      process.env.NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK = '7';
      expect(await windowsIssued()).toBe(7);
    });

    it('defaults maxWindowsPerTick to 50', async () => {
      expect(await windowsIssued()).toBe(50); // 100 windows needed, capped at 50
    });
  });
});

// ── Worker → scanner registration wiring (Task 2 of quick-260611-o5b) ──────────
// Each refactored worker, given an INJECTED scanner, must register exactly its
// expected (address, event.name) pairs, never call start() on the shared
// scanner, and unwind its registrations on stop().

describe('worker registrations on an injected scanner', () => {
  function makeFakeScanner() {
    const registered: Array<{ name: string; address: string; eventName: string }> = [];
    const unregisters: Array<ReturnType<typeof vi.fn>> = [];
    const tickUnregisters: Array<ReturnType<typeof vi.fn>> = [];
    const onTickNames: string[] = [];
    const handle: ChainScannerHandle = {
      register: vi.fn((sub: LogSubscription) => {
        registered.push({ name: sub.name, address: sub.address.toLowerCase(), eventName: sub.event.name });
        const un = vi.fn();
        unregisters.push(un);
        return un;
      }),
      onTick: vi.fn((name: string) => {
        onTickNames.push(name);
        const un = vi.fn();
        tickUnregisters.push(un);
        return un;
      }),
      start: vi.fn(),
      stop: vi.fn(),
      getStats: vi.fn(() => ({ lastBlockSeen: 42n, initialized: true, errors: 0, subscriptions: 0 })),
      tickNow: vi.fn(async () => undefined),
    };
    return { handle, registered, unregisters, tickUnregisters, onTickNames };
  }

  const FFM = '0x0000000000000000000000000000000000000f1a' as const;
  const SM = '0x0000000000000000000000000000000000000f1b' as const;
  const PR = '0x0000000000000000000000000000000000000f1c' as const;
  const ZERO = '0x0000000000000000000000000000000000000000' as const;

  const noopClient = { getBlockNumber: vi.fn().mockResolvedValue(1n), getLogs: vi.fn().mockResolvedValue([]) };
  const dbStub = {} as never;

  it('notification-fanout registers (FFM, CallerExited) + one onTick challenge pass; stop() unwinds', () => {
    const fake = makeFakeScanner();
    const worker = startNotificationFanout({
      publicClient: noopClient as unknown as NotificationFanoutConfig['publicClient'],
      ffmAddress: FFM,
      db: dbStub,
      subgraphUrl: 'https://subgraph.test',
      scanner: fake.handle,
    });

    expect(fake.registered).toEqual([{ name: 'notification-fanout', address: FFM, eventName: 'CallerExited' }]);
    expect(fake.onTickNames).toEqual(['notification-fanout-challenges']);
    expect(fake.handle.start).not.toHaveBeenCalled(); // shared scanner: index.ts starts it
    expect(worker.getStats().lastBlockSeen).toBe(42n); // reads through the scanner

    worker.stop();
    expect(fake.unregisters[0]).toHaveBeenCalledTimes(1);
    expect(fake.tickUnregisters[0]).toHaveBeenCalledTimes(1);
    expect(fake.handle.stop).not.toHaveBeenCalled(); // does not own the shared scanner
  });

  it('social-unlink-watcher registers (ProfileRegistry, SocialUnlinked) when active', () => {
    const fake = makeFakeScanner();
    const worker = startSocialUnlinkWatcher({
      publicClient: noopClient as unknown as SocialUnlinkWatcherConfig['publicClient'],
      profileRegistryAddress: PR,
      db: dbStub,
      scanner: fake.handle,
    });

    expect(fake.registered).toEqual([{ name: 'social-unlink-watcher', address: PR, eventName: 'SocialUnlinked' }]);
    worker.stop();
    expect(fake.unregisters[0]).toHaveBeenCalledTimes(1);
    expect(fake.handle.stop).not.toHaveBeenCalled();
  });

  it('social-unlink-watcher registers NOTHING when ProfileRegistry is zero-address (inactive guard)', () => {
    const fake = makeFakeScanner();
    const worker = startSocialUnlinkWatcher({
      publicClient: noopClient as unknown as SocialUnlinkWatcherConfig['publicClient'],
      profileRegistryAddress: ZERO,
      db: dbStub,
      scanner: fake.handle,
    });

    expect(fake.handle.register).not.toHaveBeenCalled();
    expect(worker.getStats()).toEqual({ lastBlockSeen: 0n, totalEventsProcessed: 0, errors: 0 });
    worker.stop(); // no-op, must not throw
  });

  it('auto-post registers BOTH (SettlementManager, CallSettled) and (FFM, CallerExited); stop() unwinds both', () => {
    const fake = makeFakeScanner();
    const worker = startAutoPostWorker({
      publicClient: noopClient as unknown as AutoPostWorkerConfig['publicClient'],
      settlementManagerAddress: SM,
      ffmAddress: FFM,
      db: dbStub,
      ogBaseUrl: 'https://callit.test',
      scanner: fake.handle,
    });

    expect(fake.registered).toEqual([
      { name: 'auto-post:settled', address: SM, eventName: 'CallSettled' },
      { name: 'auto-post:caller-exited', address: FFM, eventName: 'CallerExited' },
    ]);
    expect(typeof worker.processCall).toBe('function'); // test seam intact
    worker.stop();
    expect(fake.unregisters[0]).toHaveBeenCalledTimes(1);
    expect(fake.unregisters[1]).toHaveBeenCalledTimes(1);
    expect(fake.handle.stop).not.toHaveBeenCalled();
  });
});
