// PHASE 0 STUB. Phase 1+ adds event handlers as contracts land.
// Schema must include the entity for the handler to compile.
//
// Mapping for FollowFadeMarket contract events.
// Handles: PositionOpened, PositionExited, SharesIssued, TvlSnapshot (on USDC in/out)
//
// Phase 1+ imports:
//   import { Position, PositionExit, TvlSnapshot } from '../generated/schema'
//   import { PositionOpened, PositionExited } from '../generated/FollowFadeMarket/FollowFadeMarket'

import { ethereum } from '@graphprotocol/graph-ts';

// Phase 0 stub block handler — required by graph-cli validation.
// Phase 1+ replaces with real event handler exports when FollowFadeMarket is deployed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleBlock(_block: ethereum.Block): void {
  // No-op in Phase 0.
}
