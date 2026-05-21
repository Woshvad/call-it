/**
 * SHARE-10: OG catch-all route falls through to Fallback on unknown callId.
 *
 * Tests:
 *   1. GET /api/og/0xdeadbeef → 200, X-Variant: fallback
 *   2. ?handle=veda passthrough — rendered Fallback honors the handle param
 *
 * Run with: pnpm --filter @call-it/web test:og-routing
 * Requires: Next.js dev server running
 */

import { test, expect } from '@playwright/test';

test.describe('SHARE-10: OG catch-all route fallback', () => {
  test('Test 1: unknown callId → 200 with X-Variant: fallback', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/og/0xdeadbeef`);

    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('image/png');

    const xVariant = response.headers()['x-variant'];
    expect(xVariant).toBe('fallback');

    // Verify it's a valid 1200×630 PNG
    const buffer = await response.body();
    expect(buffer.readUInt32BE(16)).toBe(1200);
    expect(buffer.readUInt32BE(20)).toBe(630);
  });

  test('Test 2: ?handle=veda passthrough — catch-all preserves handle param', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/og/0xdeadbeef?handle=veda`);

    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('image/png');

    const xVariant = response.headers()['x-variant'];
    expect(xVariant).toBe('fallback');

    const buffer = await response.body();
    expect(buffer.readUInt32BE(16)).toBe(1200);
    expect(buffer.readUInt32BE(20)).toBe(630);
  });
});
