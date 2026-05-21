// PHASE 0 STUB. Phase 1+ adds event handlers as contracts land.
// Schema must include the entity for the handler to compile.
//
// Mapping for ChallengeEscrow contract events.
// Handles: ChallengeProposed, ChallengeAccepted, ChallengeSettled,
//          ChallengePaidOut, UnclaimedOverageCreated, TvlSnapshot
//
// Phase 1+ imports:
//   import { Challenge, ChallengePayout, UnclaimedOverage, TvlSnapshot } from '../generated/schema'
//   import { ChallengeProposed, ChallengeSettled } from '../generated/ChallengeEscrow/ChallengeEscrow'

import { ethereum } from '@graphprotocol/graph-ts';

// Phase 0 stub block handler — required by graph-cli validation.
// Phase 1+ replaces with real event handler exports when ChallengeEscrow is deployed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleBlock(_block: ethereum.Block): void {
  // No-op in Phase 0.
}
