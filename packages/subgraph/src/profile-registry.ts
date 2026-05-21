// PHASE 0 STUB. Phase 1+ adds event handlers as contracts land.
// Schema must include the entity for the handler to compile.
//
// Mapping for ProfileRegistry contract events.
// Handles: ProfileCreated, SocialLinked, SocialUnlinked, HandleSet,
//          QuoteCallEmitted, ConvictionCapped, PaymasterEventLogged
//
// Phase 1+ imports:
//   import {
//     Profile, SocialLink, CategoryRep, ConvictionCap,
//     PaymasterEvent, QuoteCall, CallerExit, PayoutClaim
//   } from '../generated/schema'
//   import { ProfileCreated, SocialLinked } from '../generated/ProfileRegistry/ProfileRegistry'

import { ethereum } from '@graphprotocol/graph-ts';

// Phase 0 stub block handler — required by graph-cli validation.
// Phase 1+ replaces with real event handler exports when ProfileRegistry is deployed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleBlock(_block: ethereum.Block): void {
  // No-op in Phase 0.
}
