// PHASE 0 STUB. Phase 1+ adds event handlers as contracts land.
// Schema must include the entity for the handler to compile.
//
// Mapping for SettlementManager contract events.
// Handles: CallSettled, DisputeRaised, DisputeResolved, CallForceSettled,
//          SettlementDelayed, RepCalculated, RepCalculatedFallback
//
// Phase 1+ imports:
//   import {
//     Settlement, Dispute, DisputeResolution, ForceSettlement,
//     SettlementDelayed, RepCalculatedFallback, RepEvent, CategoryRep, LeaderboardEntry
//   } from '../generated/schema'
//   import { CallSettled, DisputeRaised } from '../generated/SettlementManager/SettlementManager'

import { ethereum } from '@graphprotocol/graph-ts';

// Phase 0 stub block handler — required by graph-cli validation.
// Phase 1+ replaces with real event handler exports when SettlementManager is deployed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleBlock(_block: ethereum.Block): void {
  // No-op in Phase 0.
}
