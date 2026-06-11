/**
 * D-27 subgraph URL precedence — behavioral + static source assertions (Vitest).
 *
 * quick-260611-lks: the production Graph gateway URL embeds the API key in its
 * path, so it can only ever live in the server-only `SUBGRAPH_URL` env var.
 * These tests pin the precedence chain in both web subgraph readers:
 *   - leaderboard-client: SUBGRAPH_URL → NEXT_PUBLIC_SUBGRAPH_URL (legacy) → ''
 *   - relayer-client:     SUBGRAPH_URL → SUBGRAPH_URL_SEPOLIA const (keyless)
 * plus a leak guard rejecting any gateway host literal in either lib file.
 *
 * Only https://example.com placeholder URLs are used in stubs — never a real
 * endpoint, and never the gateway URL/key (commit rule).
 *
 * Requirements: D-27, D-15
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readSrc(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf-8');
}

/** Fetch mock that records the URL it was called with and returns an empty board. */
function makeFetchMock() {
  const calls: string[] = [];
  const mock = vi.fn(async (url: string | URL) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({ data: { profiles: [] } }),
    };
  });
  return { mock, calls };
}

describe('leaderboard-client SUBGRAPH_URL precedence (D-27)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('Test 1: server-only SUBGRAPH_URL WINS over NEXT_PUBLIC_SUBGRAPH_URL', async () => {
    vi.resetModules();
    vi.stubEnv('SUBGRAPH_URL', 'https://example.com/server-only-url');
    vi.stubEnv('NEXT_PUBLIC_SUBGRAPH_URL', 'https://example.com/legacy-public-url');
    const { mock, calls } = makeFetchMock();
    vi.stubGlobal('fetch', mock);

    const { getLeaderboard } = await import('@/lib/leaderboard-client');
    await getLeaderboard();

    expect(mock).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe('https://example.com/server-only-url');
  });

  it('Test 2: legacy NEXT_PUBLIC_SUBGRAPH_URL still works when SUBGRAPH_URL is unset', async () => {
    vi.resetModules();
    // undefined DELETES the var — '' would NOT fall through the ?? chain.
    vi.stubEnv('SUBGRAPH_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_SUBGRAPH_URL', 'https://example.com/legacy-public-url');
    const { mock, calls } = makeFetchMock();
    vi.stubGlobal('fetch', mock);

    const { getLeaderboard } = await import('@/lib/leaderboard-client');
    await getLeaderboard();

    expect(mock).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe('https://example.com/legacy-public-url');
  });

  it('Test 3: neither env set → empty board, fetch NEVER called', async () => {
    vi.resetModules();
    vi.stubEnv('SUBGRAPH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUBGRAPH_URL', '');
    const { mock } = makeFetchMock();
    vi.stubGlobal('fetch', mock);

    const { getLeaderboard } = await import('@/lib/leaderboard-client');
    const result = await getLeaderboard();

    expect(result).toEqual({ rows: [], windowedDataAvailable: false });
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('relayer-client SUBGRAPH_URL sourcing (D-27, static)', () => {
  it('Test 4: settled-fields URL is env-first with the keyless const fallback', () => {
    const src = readSrc('lib', 'relayer-client.ts');
    expect(src).toMatch(/process\.env\['SUBGRAPH_URL'\] \?\? SUBGRAPH_URL_SEPOLIA/);
    expect(src).toMatch(/import \{[^}]*SUBGRAPH_URL_SEPOLIA[^}]*\} from '@call-it\/shared'/);
  });

  it('Test 5 (leak guard): no gateway host literal in either lib file', () => {
    // Build the needle without writing the host as a plain literal in this file
    // (the commit rule forbids committing the gateway URL anywhere).
    const GATEWAY_HOST = ['gateway', 'thegraph', 'com'].join('.');
    const leaderboard = readSrc('lib', 'leaderboard-client.ts');
    const relayer = readSrc('lib', 'relayer-client.ts');
    expect(leaderboard).not.toContain(GATEWAY_HOST);
    expect(relayer).not.toContain(GATEWAY_HOST);
  });
});
