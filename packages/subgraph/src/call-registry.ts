// PHASE 0 STUB. Phase 1+ adds event handlers as contracts land.
// Schema must include the entity for the handler to compile.
//
// Mapping for CallRegistry contract events.
// Handles: CallCreated, CallCancelled, ConvictionCapped, CallerExited,
//          PayoutClaimed, TvlSnapshot (emitted on every USDC transfer)
//
// Phase 1+ imports:
//   import { Call, ConvictionCap, CallerExit, PayoutClaim, TvlSnapshot } from '../generated/schema'
//   import { CallCreated, ConvictionCapped, CallerExited, PayoutClaimed } from '../generated/CallRegistry/CallRegistry'

import { ethereum } from '@graphprotocol/graph-ts';

// Phase 0 stub block handler — required by graph-cli validation (at least one handler).
// Phase 1+ replaces this with real event handler exports when CallRegistry is deployed.
// e.g.: export function handleCallCreated(event: CallCreated): void { ... }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleBlock(_block: ethereum.Block): void {
  // No-op in Phase 0. Block handlers are only a scaffold to satisfy graph-cli validation.
  // Phase 1+ removes this stub and replaces with event-driven handlers.
}
