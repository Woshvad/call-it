/**
 * miniapp-ready.test.ts — Regression test of record for 08-06 GAP 2.
 *
 * UAT 08 GAP 2 (severity: major): tapping the Mini App launch button
 * ("View on Call It") opened a BLANK page because the app never called
 * `sdk.actions.ready()` — Farcaster Mini Apps stay on the host splash until
 * ready() is signalled. 08-06 adds a `MiniAppReady` component whose ready-signal
 * logic is extracted into the pure-ish `signalReady` helper so it can be tested
 * here WITHOUT a browser SDK or React rendering (apps/web vitest is node env, no
 * jsdom — matches the tests/**\/*.test.ts convention).
 *
 * This file locks:
 *   1. signalReady invokes the injected ready() exactly once.
 *   2. signalReady resolves WITHOUT throwing when the loader REJECTS (simulating
 *      "not inside a Mini App host" — normal browser must not break).
 *   3. signalReady resolves WITHOUT throwing when ready() itself THROWS.
 *
 * The live in-Warpcast webview render is a manual/tool check — CI cannot drive
 * Warpcast (see 08-06-PLAN verification note).
 */

import { describe, it, expect, vi } from 'vitest';
import { signalReady } from '../app/call/[id]/MiniAppReady';

describe('signalReady — Mini App ready() splash-dismiss (08-06 GAP 2)', () => {
  it('invokes the injected ready() exactly once', async () => {
    const ready = vi.fn(async () => {});
    const loader = vi.fn(async () => ({ actions: { ready } }));

    await signalReady(loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('resolves without throwing when the loader REJECTS (host absent — normal browser)', async () => {
    const loader = vi.fn(async () => {
      throw new Error('Cannot find module @farcaster/miniapp-sdk host context');
    });

    // Must NOT reject — the page has to render normally outside a Mini App host.
    await expect(signalReady(loader)).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('resolves without throwing when ready() itself THROWS', async () => {
    const ready = vi.fn(() => {
      throw new Error('not in a mini app');
    });
    const loader = vi.fn(async () => ({ actions: { ready } }));

    await expect(signalReady(loader)).resolves.toBeUndefined();
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('resolves without throwing when ready() rejects asynchronously', async () => {
    const ready = vi.fn(async () => {
      throw new Error('host rejected ready');
    });
    const loader = vi.fn(async () => ({ actions: { ready } }));

    await expect(signalReady(loader)).resolves.toBeUndefined();
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
