/**
 * Enum-uint parity test — TS integer maps vs the DEPLOYED Solidity enums.
 *
 * quick-260611-co5 CR-01: EVENT_SUBTYPE_TO_UINT drifted from the Phase 05.1
 * "Option A" enum split (Governance → Governance_Snapshot/Governance_Tally,
 * ProtocolMilestone renumbered 7 → 8). The composer's direct createCall write
 * would have submitted eventSubtype=7 (Governance_Tally on-chain) for a
 * Protocol Milestone call — permanently mis-typed and mis-routed at settlement.
 *
 * D-15 honesty: every expected ordinal below is HAND-PINNED from the Solidity
 * source — NOT derived from the TS maps under test. If either side moves, this
 * test fires. Canonical truth:
 *
 *   packages/contracts/src/interfaces/ICallRegistry.sol
 *     EventSubtype  — lines 23-34:
 *       None=0, TvlMilestone=1, VolumeFees=2, OnchainMetric=3, CexListing=4,
 *       TokenLaunch=5, Governance_Snapshot=6, Governance_Tally=7,
 *       ProtocolMilestone=8
 *     MarketType    — lines 16-20: PriceTarget=0, SpreadVs=1, Event=2
 *     CallStatus    — lines 39-44: Live=0, Settled=1, Disputed=2, CallerExited=3
 *     Category      — lines 56-60: Majors=0, DeFi=1, Other=2
 *
 * Requirement: D-29 anti-drift, CALL-22/23/24, quick-260611-co5 CR-01
 */

import { describe, it, expect } from 'vitest';
import {
  MARKET_TYPE_TO_UINT,
  EVENT_SUBTYPE_TO_UINT,
  UINT_TO_EVENT_SUBTYPE,
  CATEGORY_TO_UINT,
  CALL_STATUS_TO_UINT,
} from '../src/index.js';

describe('EVENT_SUBTYPE_TO_UINT matches deployed ICallRegistry.EventSubtype (05.1 enum split)', () => {
  it('pins every TS subtype to its hand-copied Solidity ordinal (ICallRegistry.sol:23-34)', () => {
    // Hand-pinned from ICallRegistry.sol — do NOT compute these from the map.
    expect(EVENT_SUBTYPE_TO_UINT.none).toBe(0); // None
    expect(EVENT_SUBTYPE_TO_UINT.tvlMilestone).toBe(1); // TvlMilestone
    expect(EVENT_SUBTYPE_TO_UINT.volumeFees).toBe(2); // VolumeFees
    expect(EVENT_SUBTYPE_TO_UINT.onchainMetric).toBe(3); // OnchainMetric
    expect(EVENT_SUBTYPE_TO_UINT.cexListing).toBe(4); // CexListing
    expect(EVENT_SUBTYPE_TO_UINT.tokenLaunch).toBe(5); // TokenLaunch
    // Single TS 'governance' label → Governance_Snapshot(6). Governance_Tally(7)
    // is NOT expressible from TS until the union splits (CR-01 follow-up).
    expect(EVENT_SUBTYPE_TO_UINT.governance).toBe(6); // Governance_Snapshot
    // THE CR-01 REGRESSION PIN: pre-05.1 this was 7, which on the deployed
    // contract means Governance_Tally — a Protocol Milestone call would have
    // been routed to the Tally oracle adapter at settlement.
    expect(EVENT_SUBTYPE_TO_UINT.protocolMilestone).toBe(8); // ProtocolMilestone
  });

  it('never emits 7 (Governance_Tally) — inexpressible until the TS union splits', () => {
    expect(Object.values(EVENT_SUBTYPE_TO_UINT)).not.toContain(7);
  });

  it('decodes every deployed ordinal 0..8, with both governance flavors → "governance"', () => {
    expect(UINT_TO_EVENT_SUBTYPE[6]).toBe('governance'); // Governance_Snapshot
    expect(UINT_TO_EVENT_SUBTYPE[7]).toBe('governance'); // Governance_Tally
    expect(UINT_TO_EVENT_SUBTYPE[8]).toBe('protocolMilestone');
    for (let ordinal = 0; ordinal <= 8; ordinal++) {
      expect(UINT_TO_EVENT_SUBTYPE[ordinal], `ordinal ${ordinal} must decode`).toBeDefined();
    }
  });

  it('encode→decode round-trips for every TS subtype label', () => {
    for (const [label, uint] of Object.entries(EVENT_SUBTYPE_TO_UINT)) {
      expect(UINT_TO_EVENT_SUBTYPE[uint]).toBe(label);
    }
  });
});

describe('remaining enum maps match ICallRegistry.sol ordinals (hand-pinned)', () => {
  it('MarketType (ICallRegistry.sol:16-20)', () => {
    expect(MARKET_TYPE_TO_UINT.priceTarget).toBe(0);
    expect(MARKET_TYPE_TO_UINT.spreadVs).toBe(1);
    expect(MARKET_TYPE_TO_UINT.event).toBe(2);
  });

  it('Category (ICallRegistry.sol:56-60)', () => {
    expect(CATEGORY_TO_UINT.majors).toBe(0);
    expect(CATEGORY_TO_UINT.defi).toBe(1);
    expect(CATEGORY_TO_UINT.other).toBe(2);
  });

  it('CallStatus (ICallRegistry.sol:39-44 — ordinals are stable, do NOT reorder)', () => {
    expect(CALL_STATUS_TO_UINT.live).toBe(0);
    expect(CALL_STATUS_TO_UINT.settled).toBe(1);
    expect(CALL_STATUS_TO_UINT.disputed).toBe(2);
    expect(CALL_STATUS_TO_UINT.callerExited).toBe(3);
  });
});
