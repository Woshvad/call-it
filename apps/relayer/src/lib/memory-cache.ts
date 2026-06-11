/**
 * In-process bounded TTL map — the L1 cache primitive (quick-260611-h36).
 *
 * WHY an in-process map is a legitimate L1 here: the relayer runs as a SINGLE
 * Fly machine (fly.toml, auto_stop_machines=false), so there is no second
 * process whose cache could diverge. During the 2026-06-11 live outage the
 * Upstash free-tier quota exhausted (500K/500K commands), which made every
 * Redis read/write fail and let The Graph Studio endpoint 429-storm — feed,
 * profile and positions rendered EMPTY despite 15 on-chain calls. This L1
 * keeps responses served from memory through a dead Redis.
 *
 * Design constraints:
 * - Purely LAZY expiry — no timers/intervals (zero idle CPU; this module must
 *   never create background work — the idle BullMQ worker burning the Redis
 *   quota 24/7 is exactly the failure mode this plan removes).
 * - Bounded: FIFO eviction at maxEntries (JS Maps preserve insertion order).
 *   Re-set of an existing key refreshes its insertion order (delete-then-set)
 *   so hot keys are not evicted as "oldest".
 * - getStale() supports last-known-good serving (subgraph circuit breaker):
 *   an entry past its TTL but within the stale horizon is still retrievable,
 *   marked { fresh: false }.
 *
 * Threat ref: T-h36-05 (DoS via unbounded growth) — mitigated by the
 * maxEntries FIFO bound + lazy expiry.
 */

export interface StaleResult<T> {
  value: T;
  /** true while now < expiresAt (within TTL); false when served stale. */
  fresh: boolean;
  /** Milliseconds since the entry was inserted. */
  ageMs: number;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  insertedAt: number;
}

export class MemoryCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  /** Fresh-only read: returns the value while now < expiresAt, else undefined. */
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) return undefined;
    return entry.value as T;
  }

  /**
   * Write a value with a TTL (ms). On a NEW key at capacity, the oldest-
   * inserted key is evicted (FIFO). On an EXISTING key, insertion order is
   * refreshed (delete-then-set) so the key is treated as newest.
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    if (this.entries.has(key)) {
      // Refresh insertion order for existing keys.
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxEntries) {
      // Evict the oldest-inserted key (Maps preserve insertion order).
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: now + ttlMs, insertedAt: now });
  }

  /**
   * Stale-tolerant read for last-known-good serving. Returns the entry as long
   * as it was inserted within staleHorizonMs (default 1h), with fresh=false
   * when past its TTL. Past the horizon the entry is deleted and null returned.
   */
  getStale<T>(key: string, staleHorizonMs = 3_600_000): StaleResult<T> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const now = Date.now();
    const ageMs = now - entry.insertedAt;
    if (ageMs > staleHorizonMs) {
      this.entries.delete(key);
      return null;
    }
    return {
      value: entry.value as T,
      fresh: now < entry.expiresAt,
      ageMs,
    };
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** @internal Test isolation helper — clears all entries. */
  _clearAllForTesting(): void {
    this.entries.clear();
  }
}

/** Shared default L1 instance — used by lib/cache.ts (response caches). */
export const memoryCache = new MemoryCache();
