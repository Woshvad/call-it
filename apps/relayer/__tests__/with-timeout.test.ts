/**
 * withTimeout unit tests — quick-260610-sr0.
 *
 * Tests:
 *   1. Pass-through resolution — underlying value returned unchanged
 *   2. Pass-through rejection — ORIGINAL error propagates unchanged
 *   3. Timeout — rejects with Error containing label + ms
 *   4. Timer cleanup — no leaked setTimeout handle after settle (fake timers)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout } from '../src/lib/with-timeout.js';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 1: resolves pass-through — underlying value returned unchanged', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'x')).resolves.toBe(42);
  });

  it('Test 2: rejection pass-through — original error propagates unchanged', async () => {
    const original = new Error('upstream exploded');
    await expect(withTimeout(Promise.reject(original), 1000, 'x')).rejects.toBe(original);
  });

  it('Test 3: timeout — rejects with Error containing label and ms value', async () => {
    const never = new Promise<never>(() => {});
    await expect(withTimeout(never, 50, 'leg-label')).rejects.toThrow(
      'leg-label timed out after 50ms',
    );
  });

  it('Test 4: timer cleanup — no leaked setTimeout handle after settle', async () => {
    vi.useFakeTimers();

    await withTimeout(Promise.resolve('done'), 5000, 'cleanup');

    // The race settled via the resolved promise; finally must have cleared the timer
    expect(vi.getTimerCount()).toBe(0);
  });
});
