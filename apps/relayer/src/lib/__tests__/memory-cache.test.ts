/**
 * MemoryCache unit tests (quick-260611-h36 Task 1 — TDD RED).
 *
 * Tests the bounded TTL map primitive that backs the L1-first cache adapter:
 *   1. TTL expiry — get() returns the value while fresh, undefined after TTL
 *   2. FIFO eviction — oldest-inserted key evicted when maxEntries exceeded
 *   3. Stale retrieval — getStale() serves expired-but-within-horizon values
 *   4. Re-set refreshes value AND insertion order (not evicted as oldest)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../memory-cache.js';

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 1: TTL expiry — value fresh before ttl, undefined after', () => {
    const cache = new MemoryCache();
    cache.set('k', { a: 1 }, 1000);

    expect(cache.get<{ a: number }>('k')).toEqual({ a: 1 });

    vi.advanceTimersByTime(1001);

    expect(cache.get('k')).toBeUndefined();
  });

  it('Test 2: FIFO eviction — oldest-inserted key evicted at maxEntries', () => {
    const cache = new MemoryCache(3);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('c', 3, 60_000);

    // 4th key — 'a' (oldest-inserted) must be evicted
    cache.set('d', 4, 60_000);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('Test 3: getStale serves expired-but-within-horizon, null past horizon', () => {
    const cache = new MemoryCache();
    cache.set('k', 'v', 1000);

    // While fresh → fresh: true
    const fresh = cache.getStale<string>('k');
    expect(fresh).not.toBeNull();
    expect(fresh!.value).toBe('v');
    expect(fresh!.fresh).toBe(true);

    // After TTL but within the 1h stale horizon → fresh: false, ageMs > ttl
    vi.advanceTimersByTime(2000);
    const stale = cache.getStale<string>('k');
    expect(stale).not.toBeNull();
    expect(stale!.value).toBe('v');
    expect(stale!.fresh).toBe(false);
    expect(stale!.ageMs).toBeGreaterThan(1000);

    // Past the stale horizon (>1h total) → null
    vi.advanceTimersByTime(3_600_000);
    expect(cache.getStale<string>('k')).toBeNull();
  });

  it('Test 4: re-set of an existing key refreshes value and insertion order', () => {
    const cache = new MemoryCache(3);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('c', 3, 60_000);

    // Re-set 'a' — it must move to newest position
    cache.set('a', 10, 60_000);

    // 4th distinct key — 'b' is now the oldest and must be evicted, NOT 'a'
    cache.set('d', 4, 60_000);

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('delete and _clearAllForTesting remove entries', () => {
    const cache = new MemoryCache();
    cache.set('x', 1, 60_000);
    cache.delete('x');
    expect(cache.get('x')).toBeUndefined();

    cache.set('y', 2, 60_000);
    cache._clearAllForTesting();
    expect(cache.get('y')).toBeUndefined();
  });
});
