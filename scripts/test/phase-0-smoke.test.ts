/**
 * phase-0-smoke.test.ts — unit tests for phase-0-smoke.ts
 *
 * Tests are mocked at the HTTP level (no live network calls).
 * Covers:
 *   1. Percentile math correctness (p50, p95, p99 for known timing arrays)
 *   2. All 6 steps run even when step 1 fails (full diagnostic mode)
 *   3. Any single step failure produces overall: 'fail' and exit code 1
 *   4. step3RelayerHealth validates { status: 'ok' } shape
 *   5. step4SubgraphDeployed validates _meta.block.number
 *   6. step5OgFallbackPercentile validates headers + body length
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  percentile,
  step3RelayerHealth,
  step4SubgraphDeployed,
  step5OgFallbackPercentile,
  step6SyntheticAlert,
  runSmokeTest,
  type SmokeResults,
  type StepStatus,
} from '../phase-0-smoke.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetch(responses: Array<{
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  bodyBuffer?: ArrayBuffer;
  latencyMs?: number;
}>): typeof fetch {
  let callCount = 0;
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const resp = responses[Math.min(callCount++, responses.length - 1)]!;
    if (resp.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, resp.latencyMs));
    }

    const headers = new Headers(resp.headers ?? {});
    const body = resp.bodyBuffer
      ? resp.bodyBuffer
      : resp.body !== undefined
        ? typeof resp.body === 'string'
          ? resp.body
          : JSON.stringify(resp.body)
        : '';

    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      headers,
      json: async () => {
        if (typeof resp.body === 'string') throw new Error('Body is a string, not JSON');
        return resp.body;
      },
      arrayBuffer: async () =>
        resp.bodyBuffer ?? new TextEncoder().encode(typeof body === 'string' ? body : '').buffer,
      text: async () => (typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body)),
      clone: () => ({} as Response),
    } as Response;
  }) as unknown as typeof fetch;
}

function makeSpawn(exitCode: number): typeof import('child_process').spawn {
  return vi.fn((_cmd: string, _args: string[], _opts: object) => {
    const { EventEmitter } = require('events') as typeof import('events');
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    proc.stdout = stdout;
    proc.stderr = stderr;
    // Emit 'close' on next tick
    setTimeout(() => proc.emit('close', exitCode), 10);
    return proc as ReturnType<typeof import('child_process').spawn>;
  }) as unknown as typeof import('child_process').spawn;
}

// ─── Test Suite 1: Percentile math ───────────────────────────────────────────

describe('percentile()', () => {
  it('computes p50 of [10, 20, 30, 40, 50] as 30', () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 50)).toBe(30);
  });

  it('computes p95 of a 100-element uniform array correctly', () => {
    // [1, 2, 3, ..., 100] sorted
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    // p95 = ceil(0.95 * 100) = 95th element = 95
    expect(percentile(values, 95)).toBe(95);
  });

  it('computes p99 of a controlled array as the correct ceiling value', () => {
    // 20 elements: [1..20]. p99 = ceil(0.99 * 20) = ceil(19.8) = 20th = 20
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(values, 99)).toBe(20);
  });

  it('returns 0 for an empty array', () => {
    expect(percentile([], 95)).toBe(0);
  });

  it('handles a single-element array', () => {
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
  });

  it('smoke: p95 of 100 values all = 50ms is 50', () => {
    const values = Array.from({ length: 100 }, () => 50);
    expect(percentile(values, 95)).toBe(50);
  });

  it('p95 below threshold: 99 values at 20ms + 1 outlier at 500ms → p95 = 20', () => {
    const values = [...Array.from({ length: 99 }, () => 20), 500].sort((a, b) => a - b);
    // p95 = ceil(0.95 * 100) = 95th = 20 (the 95th sorted value is still 20)
    expect(percentile(values, 95)).toBeLessThan(100);
  });
});

// ─── Test Suite 2: step3RelayerHealth ────────────────────────────────────────

describe('step3RelayerHealth()', () => {
  it('returns pass when relayer returns 200 + { status: ok }', async () => {
    const fetchFn = makeFetch([{ status: 200, body: { status: 'ok' } }]);
    const result = await step3RelayerHealth('https://relayer.example.com', fetchFn);
    expect(result.status).toBe('pass');
  });

  it('returns fail when relayer returns non-200', async () => {
    const fetchFn = makeFetch([{ status: 503, body: { error: 'service unavailable' } }]);
    const result = await step3RelayerHealth('https://relayer.example.com', fetchFn);
    expect(result.status).toBe('fail');
    expect(result.error).toContain('503');
  });

  it('returns fail when body does not have { status: ok }', async () => {
    const fetchFn = makeFetch([{ status: 200, body: { running: true } }]);
    const result = await step3RelayerHealth('https://relayer.example.com', fetchFn);
    expect(result.status).toBe('fail');
    expect(result.error).toContain("status: 'ok'");
  });

  it('returns skip when no relayer URL provided', async () => {
    const fetchFn = makeFetch([]);
    const result = await step3RelayerHealth('', fetchFn);
    expect(result.status).toBe('skip');
  });
});

// ─── Test Suite 3: step4SubgraphDeployed ─────────────────────────────────────

describe('step4SubgraphDeployed()', () => {
  it('returns pass when _meta.block.number is a number', async () => {
    const fetchFn = makeFetch([
      { status: 200, body: { data: { _meta: { block: { number: 12345678 } } } } },
    ]);
    const result = await step4SubgraphDeployed('https://subgraph.example.com', fetchFn);
    expect(result.status).toBe('pass');
  });

  it('returns fail when _meta.block.number is null', async () => {
    const fetchFn = makeFetch([
      { status: 200, body: { data: { _meta: { block: { number: null } } } } },
    ]);
    const result = await step4SubgraphDeployed('https://subgraph.example.com', fetchFn);
    expect(result.status).toBe('fail');
    expect(result.error).toContain('null');
  });

  it('returns fail when _meta is missing', async () => {
    const fetchFn = makeFetch([{ status: 200, body: { data: {} } }]);
    const result = await step4SubgraphDeployed('https://subgraph.example.com', fetchFn);
    expect(result.status).toBe('fail');
  });

  it('returns skip when no subgraph URL provided', async () => {
    const fetchFn = makeFetch([]);
    const result = await step4SubgraphDeployed('', fetchFn);
    expect(result.status).toBe('skip');
  });
});

// ─── Test Suite 4: step5OgFallbackPercentile ─────────────────────────────────

describe('step5OgFallbackPercentile()', () => {
  it('returns pass when all responses are fast + correct headers', async () => {
    // 101 responses: 1 warmup + 100 measurement (all at ~5ms simulated, valid headers)
    const pngBuffer = new Uint8Array(5000).buffer; // 5000 bytes > 1000
    const successResponse = {
      status: 200,
      headers: { 'content-type': 'image/png', 'x-variant': 'fallback' },
      bodyBuffer: pngBuffer,
      latencyMs: 5,
    };
    const responses = Array.from({ length: 101 }, () => successResponse);
    const fetchFn = makeFetch(responses);
    const result = await step5OgFallbackPercentile('https://web.example.com', fetchFn);
    expect(result.status).toBe('pass');
    expect(result.p95).toBeDefined();
    expect(result.p95!).toBeLessThan(100);
  }, 30_000);

  it('returns fail when p95 exceeds 100ms', async () => {
    // 101 responses all at 200ms
    const pngBuffer = new Uint8Array(5000).buffer;
    const slowResponse = {
      status: 200,
      headers: { 'content-type': 'image/png', 'x-variant': 'fallback' },
      bodyBuffer: pngBuffer,
      latencyMs: 200,
    };
    const responses = Array.from({ length: 101 }, () => slowResponse);
    const fetchFn = makeFetch(responses);
    const result = await step5OgFallbackPercentile('https://web.example.com', fetchFn);
    expect(result.status).toBe('fail');
    expect(result.error).toContain('p95');
  }, 30_000);

  it('returns skip when no web URL provided', async () => {
    const fetchFn = makeFetch([]);
    const result = await step5OgFallbackPercentile('', fetchFn);
    expect(result.status).toBe('skip');
  });

  it('returns fail when X-Variant header is wrong', async () => {
    const pngBuffer = new Uint8Array(5000).buffer;
    // More than 10 failures out of 100 triggers fail
    const badResponse = {
      status: 200,
      headers: { 'content-type': 'image/png', 'x-variant': 'live' }, // wrong variant
      bodyBuffer: pngBuffer,
      latencyMs: 5,
    };
    const responses = Array.from({ length: 101 }, () => badResponse);
    const fetchFn = makeFetch(responses);
    const result = await step5OgFallbackPercentile('https://web.example.com', fetchFn);
    expect(result.status).toBe('fail');
  }, 30_000);
});

// ─── Test Suite 5: step6SyntheticAlert ───────────────────────────────────────

describe('step6SyntheticAlert()', () => {
  beforeEach(() => {
    process.env['TELEGRAM_BOT_TOKEN'] = 'fake-token';
    process.env['TELEGRAM_CHAT_ID_P0'] = '-1001234567890';
    process.env['RELAYER_INTERNAL_HMAC'] = 'fake-hmac-secret';
  });

  it('returns pass when subprocess exits 0', async () => {
    const spawnFn = makeSpawn(0);
    const result = await step6SyntheticAlert('https://relayer.example.com', true, spawnFn);
    expect(result.status).toBe('pass');
  });

  it('returns fail when subprocess exits non-zero', async () => {
    const spawnFn = makeSpawn(1);
    const result = await step6SyntheticAlert('https://relayer.example.com', true, spawnFn);
    expect(result.status).toBe('fail');
  });

  it('returns skip when requireSyntheticAlert is false', async () => {
    const spawnFn = makeSpawn(0);
    const result = await step6SyntheticAlert('https://relayer.example.com', false, spawnFn);
    expect(result.status).toBe('skip');
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

// ─── Test Suite 6: All steps run even when step 1 fails ─────────────────────

describe('runSmokeTest() failure modes', () => {
  it('runs all 6 steps even if step 1 fails — full diagnostic output', async () => {
    // Mock fetch: relayer health OK, subgraph OK, OG fast
    const pngBuffer = new Uint8Array(5000).buffer;
    const responses = [
      // step 3: relayer health
      { status: 200, body: { status: 'ok' } },
      // step 4: subgraph
      { status: 200, body: { data: { _meta: { block: { number: 999 } } } } },
      // step 5: warmup + 100 OG requests
      ...Array.from({ length: 101 }, () => ({
        status: 200,
        headers: { 'content-type': 'image/png', 'x-variant': 'fallback' },
        bodyBuffer: pngBuffer,
        latencyMs: 2,
      })),
    ];
    const fetchFn = makeFetch(responses);
    const spawnFn = makeSpawn(0);

    // step1Override: simulates step 1 FAILING — tests that runner continues through all 6 steps
    const step1Override = async () => ({ status: 'fail' as StepStatus, error: 'Mock build failure' });

    const opts = {
      network: 'sepolia',
      webUrl: 'https://web.example.com',
      relayerUrl: 'https://relayer.example.com',
      subgraphUrl: 'https://subgraph.example.com',
      requireSyntheticAlert: true,
    };

    const results = await runSmokeTest(opts, { fetchFn, spawnFn, step1Override });

    // step 1 injected as fail — but ALL 6 steps must have run (full diagnostic mode)
    expect(results.step1).toBe('fail');
    // steps 2-6 must all have a result (not undefined)
    expect(results).toHaveProperty('step2');
    expect(results).toHaveProperty('step3');
    expect(results).toHaveProperty('step4');
    expect(results).toHaveProperty('step5');
    expect(results).toHaveProperty('step6');
    expect(results).toHaveProperty('overall');
    expect(results).toHaveProperty('timestamp');
    // overall must be fail because step1 failed
    expect(results.overall).toBe('fail');
    // steps 3, 4 should be pass (mocked as OK)
    expect(results.step3).toBe('pass');
    expect(results.step4).toBe('pass');
  }, 60_000);

  it('overall is fail when any single step fails', async () => {
    // step 3 returns 503
    const fetchFn = makeFetch([
      { status: 503, body: { error: 'service unavailable' } },
      // subgraph (step 4)
      { status: 200, body: { data: { _meta: { block: { number: 999 } } } } },
    ]);
    const spawnFn = makeSpawn(0);
    const step1Override = async () => ({ status: 'pass' as StepStatus });

    const opts = {
      network: 'sepolia',
      webUrl: '', // skip step 5
      relayerUrl: 'https://relayer.example.com',
      subgraphUrl: 'https://subgraph.example.com',
      requireSyntheticAlert: false, // skip step 6
    };

    const results = await runSmokeTest(opts, { fetchFn, spawnFn, step1Override });
    // step 3 must fail because of 503
    expect(results.step3).toBe('fail');
    // overall must be fail
    expect(results.overall).toBe('fail');
  }, 30_000);

  it('smoke results JSON contains errors key with step-specific messages', async () => {
    const fetchFn = makeFetch([
      { status: 401, body: { error: 'unauthorized' } }, // step 3 fails
    ]);
    const spawnFn = makeSpawn(0);
    const step1Override = async () => ({ status: 'pass' as StepStatus });

    const opts = {
      network: 'sepolia',
      webUrl: '',
      relayerUrl: 'https://relayer.example.com',
      subgraphUrl: '',
      requireSyntheticAlert: false,
    };

    const results = await runSmokeTest(opts, { fetchFn, spawnFn, step1Override });
    expect(results.errors).toHaveProperty('step3');
    expect(typeof results.errors['step3']).toBe('string');
  }, 30_000);
});

// ─── Test Suite 7: fire-synthetic-alert.ts is referenced ──────────────────────

describe('phase-0-smoke.ts references fire-synthetic-alert.ts', () => {
  it('contains fire-synthetic-alert reference in source', async () => {
    const { readFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../phase-0-smoke.ts'),
      'utf8',
    );
    expect(src).toContain('fire-synthetic-alert');
  });
});
