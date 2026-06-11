/**
 * ABI barrel — export all contract ABIs for use in wagmi useReadContract / useWriteContract.
 *
 * Usage:
 *   import { callRegistryAbi, profileRegistryAbi } from '@/lib/abis';
 *
 * Note: ABIs are typed as `const` for full viem type inference on function names/inputs/outputs.
 */

export { callRegistryAbi } from './CallRegistry';
export { erc20Abi } from './erc20';
export { profileRegistryAbi } from './ProfileRegistry';
export { followFadeMarketAbi } from './FollowFadeMarket';
export { challengeEscrowAbi } from './ChallengeEscrow';
