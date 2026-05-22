/**
 * Task 3 TDD — Telegram alert dispatcher tests
 *
 * Tests the 9-event AlertEvent routing (P0: 6 events → CHAT_ID_P0, P1: 3 events → CHAT_ID_P1)
 * and the special rep_fallback runbook link requirement (OPS-25).
 *
 * Uses vi.mock to stub node-telegram-bot-api and avoid real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-telegram-bot-api before importing alert module
vi.mock('node-telegram-bot-api', () => {
  const mockSendMessage = vi.fn().mockResolvedValue({});
  const MockBot = vi.fn().mockImplementation(() => ({ sendMessage: mockSendMessage }));
  (MockBot as unknown as { mockSendMessage: typeof mockSendMessage }).mockSendMessage = mockSendMessage;
  return { default: MockBot };
});

// Set env vars before importing the module (module-level bot creation reads these)
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.TELEGRAM_CHAT_ID_P0 = 'p0-chat-id';
process.env.TELEGRAM_CHAT_ID_P1 = 'p1-chat-id';

import TelegramBot from 'node-telegram-bot-api';
import { sendAlert, P0_EVENTS, type AlertEvent } from '../src/workers/alerts.js';

const MockBot = TelegramBot as ReturnType<typeof vi.fn>;
const mockSendMessage = vi.fn().mockResolvedValue({});

describe('Telegram alert dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Inject mock sendMessage into bot instances
    MockBot.mockImplementation(() => ({ sendMessage: mockSendMessage }));
  });

  const P0_EVENT_LIST: AlertEvent[] = [
    'pause',
    'dispute_raised',
    'force_settle',
    'rep_fallback',
    'settle_failed',
    'stylus_reactivation',
    'address_book_cooldown_bypass_attempt', // Plan 01-07 addition (T-01-42)
  ];

  const P1_EVENT_LIST: AlertEvent[] = [
    'paymaster_80',
    'tvl_approach',
    'settle_stuck_25m',
    'user_paymaster_cap_reached', // Plan 01-07 addition (D-02)
  ];

  it('routes all P0 events to TELEGRAM_CHAT_ID_P0 with 🚨 P0 header', async () => {
    for (const event of P0_EVENT_LIST) {
      vi.clearAllMocks();
      MockBot.mockImplementation(() => ({ sendMessage: mockSendMessage }));

      await sendAlert(event, { test: true });

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const [chatId, text] = mockSendMessage.mock.calls[0]!;
      expect(chatId).toBe('p0-chat-id');
      expect(text).toContain('🚨 P0');
    }
  });

  it('routes all P1 events to TELEGRAM_CHAT_ID_P1 with 📊 P1 header', async () => {
    for (const event of P1_EVENT_LIST) {
      vi.clearAllMocks();
      MockBot.mockImplementation(() => ({ sendMessage: mockSendMessage }));

      await sendAlert(event, { test: true });

      expect(mockSendMessage).toHaveBeenCalledOnce();
      const [chatId, text] = mockSendMessage.mock.calls[0]!;
      expect(chatId).toBe('p1-chat-id');
      expect(text).toContain('📊 P1');
    }
  });

  it('rep_fallback message contains runbook link (OPS-25)', async () => {
    await sendAlert('rep_fallback', { callId: 'abc' });

    expect(mockSendMessage).toHaveBeenCalledOnce();
    const [_chatId, text] = mockSendMessage.mock.calls[0]!;
    expect(text).toContain('runbooks/relayer-key-rotation.md#manual-rep-compensation');
  });

  it('P0_EVENTS set contains exactly the listed P0 events', () => {
    for (const event of P0_EVENT_LIST) {
      expect(P0_EVENTS.has(event)).toBe(true);
    }
    for (const event of P1_EVENT_LIST) {
      expect(P0_EVENTS.has(event)).toBe(false);
    }
    expect(P0_EVENTS.size).toBe(P0_EVENT_LIST.length);
  });
});
