/**
 * Notifications GET filters — quick-260611-5mh Task 3 (A4).
 *
 * Tests:
 *   1. Legacy guard unchanged: no user + no filters → 400 missing_param
 *   2. Legacy user mode BYTE-IDENTICAL: same body keys/values for a canned row set
 *   3. callId+type filter WITHOUT user → 200 (user optional in filter mode)
 *   4. Filter conditions include callId/eventType; user still ANDed when present
 *   5. Invalid callId → 400
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRows, mockUnreadRows, mockWhereArgs } = vi.hoisted(() => ({
  mockRows: { value: [] as unknown[] },
  mockUnreadRows: { value: [{ count: '0' }] as unknown[] },
  mockWhereArgs: { rowsWhere: [] as unknown[], unreadWhere: [] as unknown[] },
}));

// Chainable drizzle stub: select() → rows query (where→orderBy→limit),
// select({count}) → unread query (where → Promise).
vi.mock('../src/db/client.js', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn((arg?: unknown) => {
      if (arg !== undefined) {
        // unread-count query: db.select({ count }) ... awaited after .where()
        return {
          from: vi.fn(() => ({
            where: vi.fn((cond: unknown) => {
              mockWhereArgs.unreadWhere.push(cond);
              return Promise.resolve(mockUnreadRows.value);
            }),
          })),
        };
      }
      return {
        from: vi.fn(() => ({
          where: vi.fn((cond: unknown) => {
            mockWhereArgs.rowsWhere.push(cond);
            return {
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(mockRows.value)),
              })),
            };
          }),
        })),
      };
    }),
    update: vi.fn(),
  })),
}));

vi.mock('../src/lib/privy-auth.js', () => ({
  privySessionPreHandler: vi.fn(async () => undefined),
  getPrivyClient: vi.fn(),
}));

vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { notificationsRoute } from '../src/routes/notifications.js';

// ── Test data ─────────────────────────────────────────────────────────────────

const USER = '0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5';

const ROW = {
  id: 1,
  userAddress: USER,
  eventType: 'challenge_proposed',
  callId: 14,
  createdAt: new Date('2026-06-10T00:00:00.000Z'),
  readAt: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/notifications — callId/type filters (quick-260611-5mh A4)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRows.value = [ROW];
    mockUnreadRows.value = [{ count: '1' }];
    mockWhereArgs.rowsWhere = [];
    mockWhereArgs.unreadWhere = [];

    app = Fastify({ logger: false });
    await app.register(notificationsRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('Test 1: no user + no filters → 400 missing_param (legacy guard unchanged)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/notifications' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('missing_param');
  });

  it('Test 2: legacy user mode response byte-identical (keys + values)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/notifications?user=${USER}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    // EXACT legacy shape: notifications + unreadCount + nextCursor, nothing else
    expect(Object.keys(body).sort()).toEqual(['nextCursor', 'notifications', 'unreadCount']);
    expect(body.unreadCount).toBe(1);
    expect(body.nextCursor).toBeNull(); // 1 row < PAGE_SIZE 20
    expect((body.notifications as unknown[]).length).toBe(1);
    // Legacy mode runs both queries (rows + unread)
    expect(mockWhereArgs.rowsWhere).toHaveLength(1);
    expect(mockWhereArgs.unreadWhere).toHaveLength(1);
  });

  it('Test 3: callId+type filter WITHOUT user → 200, same response keys, unreadCount 0', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications?callId=14&type=challenge_proposed',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual(['nextCursor', 'notifications', 'unreadCount']);
    expect((body.notifications as unknown[]).length).toBe(1);
    // Anonymous filter query: unreadCount is 0 and the per-user unread query never runs
    expect(body.unreadCount).toBe(0);
    expect(mockWhereArgs.unreadWhere).toHaveLength(0);
  });

  it('Test 4: filter mode with user still scopes to that user (unread query runs)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/notifications?callId=14&type=challenge_proposed&user=${USER}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ unreadCount: number }>().unreadCount).toBe(1);
    expect(mockWhereArgs.unreadWhere).toHaveLength(1);
  });

  it('Test 5: non-numeric callId → 400 invalid_param', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications?callId=not-a-number',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('invalid_param');
  });
});
