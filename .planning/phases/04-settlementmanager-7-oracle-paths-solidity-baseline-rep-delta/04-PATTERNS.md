# Phase 4: SettlementManager + 7 Oracle Paths + Solidity Baseline Rep Delta - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 22 new/modified files across 4 surfaces
**Analogs found:** 20 / 22

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/SettlementManager.sol` | contract | CRUD + event-driven | `packages/contracts/src/ChallengeEscrow.sol` | role-match (same CEI/ReentrancyGuard/Ownable2Step/Pausable/USDC-only stack) |
| `packages/contracts/src/FollowFadeMarket.sol` (REDEPLOY) | contract | CRUD | `packages/contracts/src/ChallengeEscrow.sol` (claimDuelPayout + settleDuel patterns) | role-match |
| `packages/contracts/src/interfaces/ISettlementManager.sol` | interface | — | `packages/contracts/src/interfaces/IChallengeEscrow.sol` | exact |
| `packages/contracts/script/DeployPhase4.s.sol` | script | batch | `packages/contracts/script/DeployPhase3.s.sol` | exact |
| `packages/contracts/test/SettlementManagerTest.sol` | test | CRUD | `packages/contracts/test/ChallengeEscrow.t.sol` + `CeTestHelper.sol` | exact |
| `packages/contracts/test/FfmSettlementTest.sol` | test | CRUD | `packages/contracts/test/FollowFadeMarket.t.sol` | exact |
| `packages/contracts/test/SettlementDisputeTest.sol` | test | event-driven | `packages/contracts/test/ChallengeEscrow.t.sol` | role-match |
| `apps/relayer/src/workers/settlement-watcher.ts` | worker | event-driven | `apps/relayer/src/workers/polled-events-fallback.ts` | role-match |
| `apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` | service | request-response | — (greenfield — no Pyth pull adapter exists) | no analog |
| `apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` | service | request-response | `apps/relayer/src/workers/cex-heartbeat.ts` (modular stub structure) | partial-match |
| `apps/relayer/src/workers/oracle-adapters/nft-twap-adapter.ts` | service | request-response | `apps/relayer/src/workers/cex-heartbeat.ts` (modular stub structure) | partial-match |
| `apps/relayer/src/workers/oracle-adapters/cex/binance-scraper.ts` (× 8) | service | event-driven | `apps/relayer/src/workers/cex-heartbeat.ts` (existing stubs) | exact (Phase 4 fills the body) |
| `apps/relayer/src/routes/settle.ts` | route | request-response | `apps/relayer/src/routes/live-state.ts` | exact |
| `apps/relayer/src/routes/disputes.ts` | route | CRUD | `apps/relayer/src/routes/duel-live-state.ts` | role-match |
| `packages/subgraph/src/settlement-manager.ts` | subgraph mapping | event-driven | `packages/subgraph/src/challenge-escrow.ts` | exact |
| `packages/subgraph/subgraph.yaml` (update) | config | — | existing `subgraph.yaml` datasource blocks | exact |
| `apps/web/app/call/[id]/page.tsx` (extend) | page | request-response | existing `apps/web/app/call/[id]/page.tsx` | exact (self-extension) |
| `apps/web/app/disputes/page.tsx` | page | CRUD | `apps/web/app/call/[id]/page.tsx` (page structure + relayer polling) | role-match |
| `apps/web/app/og/[callId]/route.ts` (extend: variants 2+4) | route | request-response | existing `apps/web/app/og/[callId]/route.ts` | exact (self-extension) |
| `apps/web/app/og/duel/[challengeId]/route.ts` (fill stubs) | route | request-response | existing `apps/web/app/og/duel/[challengeId]/route.ts` | exact (self-extension) |
| `packages/shared/src/constants/addresses.ts` (update) | config | — | existing `addresses.ts` (same pattern per deploy) | exact |
| `packages/subgraph/abis/SettlementManager.json` | config | — | `packages/subgraph/abis/ChallengeEscrow.json` | exact |

---

## Pattern Assignments

### `packages/contracts/src/SettlementManager.sol` (contract, CRUD + event-driven)

**Analog:** `packages/contracts/src/ChallengeEscrow.sol`

**Imports pattern** (ChallengeEscrow.sol lines 1-29):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// NON-UPGRADEABLE BY DESIGN (SAFETY-18): No proxy, no UUPS, no initialize().

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
import { ICallRegistry } from "./interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "./interfaces/IFollowFadeMarket.sol";
// add: import { IChallengeEscrow } from "./interfaces/IChallengeEscrow.sol";
// add: import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";
// add: import { ISettlementManager } from "./interfaces/ISettlementManager.sol";
// add: IPyth from @pythnetwork/pyth-sdk-solidity (ECDSA from OZ for attestation verify)
```

**Contract declaration + inheritance pattern** (ChallengeEscrow.sol line 46):
```solidity
contract SettlementManager is Ownable2Step, ReentrancyGuard, Pausable, ISettlementManager {
    using SafeERC20 for IERC20;
```

**onlySettlementManager guard pattern** (ChallengeEscrow.sol lines 98-102):
```solidity
modifier onlySettlementManager() {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    _;
}
```
SettlementManager does NOT use this modifier — instead it calls INTO the other contracts that have it. SettlementManager's own guard is `onlyOwner` for admin functions and `whenNotPaused` for `settle()`.

**Constructor pattern** (ChallengeEscrow.sol lines 112-129):
```solidity
constructor(
    address _callRegistry,
    address _followFadeMarket,
    address _usdc,
    address _treasury,
    uint256 _tvlCap
) Ownable(msg.sender) {
    require(_callRegistry != address(0), "invalid-registry");
    require(_usdc == USDC_ARB_NATIVE, "wrong-usdc");
    require(_treasury != address(0) && _treasury != address(this), "invalid-treasury");
    // ... immutable assignments
}
```
SettlementManager constructor: same `require(_usdc == USDC_ARB_NATIVE, "wrong-usdc")` gate, same `Ownable(msg.sender)` base, also needs `address _pyth`, `address _stylusEngine` (may be `address(0)` at deploy), `address _challengeEscrow`, `address _profileRegistry`.

**CEI pattern on USDC transfer** (ChallengeEscrow.sol lines 235-243, proposeChallenge):
```solidity
// ── EFFECTS: ALL state writes before USDC transfer (CEI, T-3-02-01) ──
ch.status   = ChallengeStatus.Refunded;
totalEscrow -= amount;

// ── INTERACTIONS ──
IERC20(USDC_ARB_NATIVE).safeTransfer(challenger_, amount);
```
SettlementManager follows the same CEI comment convention: `// ── EFFECTS ──` before `// ── INTERACTIONS ──`. Every USDC transfer is `SafeERC20.safeTransfer`.

**settleDuel call pattern** (ChallengeEscrow.sol lines 279-298):
```solidity
function settleDuel(uint256 challengeId, address winner)
    external
    onlySettlementManager
    nonReentrant
{
    Challenge storage ch = _challenges[challengeId];
    if (ch.status != ChallengeStatus.Accepted) revert ChallengeNotAccepted();
    ch.winner = winner;
    ch.status = ChallengeStatus.Settled;
    _pushOverage(challengeId, ch);
    emit ChallengeSettled(challengeId, winner);
}
```
SettlementManager calls `challengeEscrow.settleDuel(challengeId, winner)` in the duel loop (step 9). The `onlySettlementManager` modifier on ChallengeEscrow already gates this to the SettlementManager address only.

**Pause carve-out pattern** (ChallengeEscrow.sol comment at line 17):
```solidity
// PAUSE CARVE-OUTS (§10.3): claimDuelPayout and claimOverage are NOT guarded by whenNotPaused.
// proposeChallenge and acceptChallenge ARE guarded by whenNotPaused.
```
SettlementManager: `settle()` IS paused (`whenNotPaused`). `claimPayout` (in FFM, not SM) is NOT paused. `forceSettle` is `onlyOwner` — needs explicit pause check (spec §10.3: forceSettle behavior under pause is owner discretion).

**setSettlementManager pattern** (ChallengeEscrow.sol lines 375-379):
```solidity
function setSettlementManager(address newManager) external onlyOwner {
    require(newManager != address(0), "invalid-manager");
    settlementManager = newManager;
    emit SettlementManagerSet(newManager);
}
```

**ETH receive for Pyth fees** (greenfield, no analog — see RESEARCH.md):
```solidity
receive() external payable {}   // accepts ETH top-ups for Pyth update fee budget (Pitfall 4)
```

---

### `packages/contracts/src/FollowFadeMarket.sol` — REDEPLOY additions

**Analog for new `claimPayout` CEI pattern:** `packages/contracts/src/ChallengeEscrow.sol` `claimDuelPayout` (lines 305-341):
```solidity
function claimDuelPayout(uint256 challengeId)
    external
    nonReentrant
    // NOTE: NOT whenNotPaused — pause carve-out (§10.3)
{
    Challenge storage ch = _challenges[challengeId];
    if (ch.status != ChallengeStatus.Settled) revert ChallengeNotSettled();
    if (msg.sender != ch.winner) revert NotDuelWinner();
    bool isCallerWinner = (ch.winner == ch.caller);
    if (isCallerWinner) {
        if (ch.callerClaimed) revert AlreadyClaimed();
    } else {
        if (ch.challengerClaimed) revert AlreadyClaimed();
    }

    uint256 pot        = uint256(_min(ch.callerStake, ch.challengerStake)) * 2;
    uint256 payout     = pot * 99 / 100;
    uint256 protocolFee = pot - payout;

    // ── EFFECTS: ALL state writes BEFORE transfers (CEI, T-3-02-01) ──
    if (isCallerWinner) { ch.callerClaimed = true; }
    else { ch.challengerClaimed = true; }
    totalEscrow -= pot;

    // ── INTERACTIONS ──
    IERC20(USDC_ARB_NATIVE).safeTransfer(ch.winner, payout);
    IERC20(USDC_ARB_NATIVE).safeTransfer(treasury, protocolFee);

    emit PayoutClaimed(challengeId, ch.winner, payout, protocolFee);
}
```
FFM `claimPayout` replaces the stub with the same CEI order: `claimed[callId][msg.sender] = true` BEFORE `safeTransfer`. Uses `Math.mulDiv` for share-weighted payout (not a fixed percentage like duels).

**Analog for `applySettlement` (new function):** no exact analog — pattern derived from RESEARCH.md. The `_checkTvlCap` internal pattern from ChallengeEscrow (lines 406-413) shows the guard-then-effect idiom for financial accounting in FFM:
```solidity
function _checkTvlCap(uint256 incoming) internal view {
    uint256 cap = callRegistry.tvlCap();
    uint256 combined = callRegistry.currentTvl() + followFadeMarket.getTvl() + totalEscrow + incoming;
    if (combined > cap) {
        uint256 already = combined - incoming;
        revert TvlCapReached(incoming, cap > already ? cap - already : 0);
    }
}
```
`applySettlement` follows the same "compute → effects → interactions" order and uses an idempotency guard (`settlementApplied[callId] = true`).

---

### `packages/contracts/src/interfaces/ISettlementManager.sol` (interface)

**Analog:** `packages/contracts/src/interfaces/IChallengeEscrow.sol`

**Interface structure pattern** (IChallengeEscrow.sol lines 1-20):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.X — [contract] function signatures
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  LOCKED — DO NOT MODIFY AFTER PLAN 04-0X COMMIT.                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

interface ISettlementManager {
```

**Enum + struct + events + errors + functions pattern** (IChallengeEscrow.sol lines 22-240):
The interface declares: enums (OracleAdapter, DisputeStatus), structs (DisputeRecord), events (CallSettled, DisputeRaised, DisputeResolved, CallForceSettled, SettlementDelayed, RepCalculated, RepCalculatedFallback), errors (AlreadySettled, CallNotExpired, DisputeAlreadyRaised, etc.), then function signatures (settle, forceSettle, raiseDispute, resolveDispute, setSettlementManager, pause, unpause). Follows exact IChallengeEscrow convention: `/// @notice` docstrings on every function, `/// @dev Pause carve-out` where applicable.

---

### `packages/contracts/script/DeployPhase4.s.sol` (deploy script, batch)

**Analog:** `packages/contracts/script/DeployPhase3.s.sol` (full file, 175 lines)

**Script structure pattern** (DeployPhase3.s.sol lines 36-108):
```solidity
import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";

contract DeployPhase4 is Script {
    // Existing Phase 3 deployed addresses (Arbitrum Sepolia)
    address public constant CALL_REGISTRY    = 0x7DAd...34D;
    address public constant CHALLENGE_ESCROW = 0x59eb...c2;
    address public constant PROFILE_REGISTRY = 0xAfe2...9E;
    // (FollowFadeMarket gets a new address after FFM redeploy)

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        vm.startBroadcast(deployerKey);

        // 1. Deploy new FollowFadeMarket (adds applySettlement + real claimPayout)
        FollowFadeMarket ffmV2 = new FollowFadeMarket(...);

        // 2. Deploy SettlementManager
        SettlementManager sm = new SettlementManager(
            CALL_REGISTRY,
            address(ffmV2),
            CHALLENGE_ESCROW,
            PROFILE_REGISTRY,
            USDC_ARB_NATIVE,
            treasuryAddress,
            PYTH_ARBITRUM_SEPOLIA
        );

        // 3. Wire setSettlementManager on all 4 contracts
        ICallRegistry(CALL_REGISTRY).setSettlementManager(address(sm));
        ffmV2.setSettlementManager(address(sm));
        IChallengeEscrow(CHALLENGE_ESCROW).setSettlementManager(address(sm));
        IProfileRegistry(PROFILE_REGISTRY).setSettlementManager(address(sm));

        // 4. Authorize SettlementManager as rep writer
        IProfileRegistry(PROFILE_REGISTRY).setAuthorizedRepWriter(address(sm), true);

        // 5. Send ETH for Pyth fee budget
        payable(address(sm)).transfer(0.1 ether);

        vm.stopBroadcast();

        // Post-deploy assertions (pattern from DeployPhase3.s.sol lines 116-173)
        require(sm.callRegistry() == CALL_REGISTRY, "registry mismatch");
        // ...
    }
}
```

**Post-deploy assertions + console.log REQUIRED NEXT STEPS pattern** (DeployPhase3.s.sol lines 116-173):
```solidity
console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia)");
console.log("SettlementManager:", address(sm));
console.log("---");
console.log("REQUIRED NEXT STEPS:");
console.log("1. Update packages/shared/src/constants/addresses.ts:");
console.log("   SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA =", address(sm));
console.log("   FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =", address(ffmV2));
console.log("2. Update packages/subgraph/subgraph.yaml:");
console.log("   SettlementManager address + startBlock");
console.log("   FollowFadeMarket address + startBlock");
console.log("3. pnpm run deploy:sepolia (subgraph Studio redeploy)");
console.log("---");
```

---

### `packages/contracts/test/SettlementManagerTest.sol`, `FfmSettlementTest.sol`, `SettlementDisputeTest.sol` (tests)

**Analog:** `packages/contracts/test/ChallengeEscrow.t.sol` + `packages/contracts/test/helpers/CeTestHelper.sol`

**Test file header + import pattern** (ChallengeEscrow.t.sol lines 1-17):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Spec: CALL_IT_SPEC1.md §12.X — SettlementManager test matrix
// Requirement: SETTLE-02, SETTLE-05, SETTLE-08, SETTLE-46, REP-14, REP-22
//
// RED GATE: This file WILL fail to compile until Plan 04-0X creates
//   packages/contracts/src/SettlementManager.sol

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol";
import { SmTestHelper } from "./helpers/SmTestHelper.sol";  // new helper, extends CeTestHelper
```

**Test helper pattern** (CeTestHelper.sol lines 35-80):
```solidity
abstract contract SmTestHelper is CeTestHelper {
    SettlementManager internal sm;

    function setUp() public virtual override {
        super.setUp();  // boots ProfileRegistry + CallRegistry + FFM + ChallengeEscrow + MockUSDC
        // Deploy SettlementManager
        vm.startPrank(owner);
        sm = new SettlementManager(
            address(cr), address(ffm), address(ce), address(pr),
            USDC_ARB_NATIVE, treasury, PYTH_ADDRESS
        );
        cr.setSettlementManager(address(sm));
        ffm.setSettlementManager(address(sm));
        ce.setSettlementManager(address(sm));
        pr.setSettlementManager(address(sm));
        pr.setAuthorizedRepWriter(address(sm), true);
        vm.stopPrank();
    }
```

**Mock-SettlementManager pattern for testing other contracts** (ChallengeEscrow.t.sol lines 44-52):
```solidity
function _settleDuel(uint256 challengeId, address winner) internal {
    address sm = makeAddr("settlementManager");
    vm.prank(owner);
    ce.setSettlementManager(sm);
    vm.prank(sm);
    ce.settleDuel(challengeId, winner);
}
```

**Fuzz invariant pattern** (ChallengeEscrow.t.sol pattern — fuzz runs in foundry.toml `ci` profile = 1000):
```solidity
function invariantFeeSplit() public {
    // forge test --match-test invariantFeeSplit --fuzz-runs 1000
}
```

**Event assertion pattern** (ChallengeEscrow.t.sol lines 65-75):
```solidity
vm.expectEmit(true, true, false, true);
emit IChallengeEscrow.ChallengeAccepted(challengeId, alice, stake);
ce.acceptChallenge(challengeId);
```

**Mainnet-fork note (ADR-0001):** Money-path tests (settle + claimPayout + fee extraction) require `forge test --fork-url $ARB_ONE_RPC_URL` because native USDC has no code on Arbitrum Sepolia. The existing test suite uses `MockUSDC` via `vm.etch` — SettlementManagerTest uses the same `MockUSDC` approach for unit tests; add a separate `SettlementManagerForkTest.sol` for mainnet-fork money-path invariants.

---

### `apps/relayer/src/workers/settlement-watcher.ts` (worker, event-driven)

**Analog:** `apps/relayer/src/workers/polled-events-fallback.ts` (full file, 166 lines)

**Worker module structure pattern** (polled-events-fallback.ts lines 1-60):
```typescript
/**
 * Settlement watcher — BullMQ expiry queue.
 *
 * Watches for CallExpired events (via subgraph or polled fallback),
 * enqueues a delayed BullMQ job per call, processes settlement through
 * the correct oracle adapter, retries up to 30×60s for Pyth confidence.
 *
 * D-04: built in Phase 4; Phase 6 hardening adds ETH auto-topup.
 * D-03: ambiguous reads → SettlementDelayed + Telegram settle_failed alert.
 */

import type { PublicClient, Address } from 'viem';
import { logger } from '../lib/logger.js';
// add: import { Queue, Worker, Job } from 'bullmq';
// add: import { getRedis } from '../lib/redis.js';
// add: import { sendAlert } from './alerts.js';
// add: import { gcpKmsAccount } from '../lib/kms-signer.js';
```

**Export interface pattern** (polled-events-fallback.ts lines 23-35):
```typescript
export interface SettlementWatcherConfig {
  publicClient: PublicClient;
  settlementManagerAddress: Address;
  intervalMs: number;
  onSettled: (callId: bigint, outcome: string) => Promise<void> | void;
}

export interface SettlementWatcherHandle {
  stop(): void;
  getStats(): { lastBlockSeen: bigint; totalLogs: number; errors: number };
}
```

**Error resilience pattern** (polled-events-fallback.ts lines 121-131):
```typescript
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({
        event: 'settlement_watcher_error',
        error: message,
        callId: callId.toString(),
        lastBlockSeen: lastBlockSeen.toString(),
    });
    errors++;
    // Do NOT throw — the interval must keep running through transient RPC errors
}
```

**BullMQ enqueue pattern** (RESEARCH.md — no existing analog; copy from research):
```typescript
import { Queue, Worker, Job } from 'bullmq';
const settlementQueue = new Queue('settlement', { connection: redisConfig });

async function enqueueSettlement(callId: bigint, expiry: number): Promise<void> {
    const delayMs = Math.max(0, expiry * 1000 - Date.now());
    await settlementQueue.add('settle', { callId: callId.toString() }, { delay: delayMs });
}

const settlementWorker = new Worker('settlement', async (job: Job) => {
    const callId = BigInt(job.data.callId);
    // dispatch to oracle adapter...
}, { connection: redisConfig });
```

---

### `apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` (service, request-response)

**Analog:** NO CLOSE ANALOG — greenfield Pyth pull-oracle adapter. The cex-heartbeat.ts file establishes the per-adapter modular pattern (one export function per adapter), but has no oracle data fetching logic.

**Closest structural analog:** `apps/relayer/src/workers/cex-heartbeat.ts` (modular export structure):
```typescript
// Pattern: one file per adapter, one primary export function
export async function fetchPythUpdate(priceIds: string[]): Promise<`0x${string}`[]> { ... }
export async function settlePythCall(callId: bigint, updateData: `0x${string}`[]): Promise<void> { ... }
```

**Must use from RESEARCH.md:**
- `HermesClient` from `@pythnetwork/hermes-client@3.1.0`
- `hermes.getLatestPriceUpdates(priceIds)` → `updates.binary.data.map(d => '0x' + d)`
- `publicClient.readContract({ functionName: 'getUpdateFee', args: [updateData] })` before calling settle
- `walletClient.writeContract({ functionName: 'settle', args: [callId, updateData], value: feeWei })`
- All signing via `gcpKmsAccount` from `kms-signer.ts` (not a local key)

**Pyth ETH fee budget monitoring** (no analog — from RESEARCH.md Pitfall 4):
```typescript
const balance = await publicClient.getBalance({ address: SETTLEMENT_MANAGER_ADDRESS });
if (balance < parseEther('0.01')) {
    await sendAlert('settle_failed', { reason: 'eth_balance_low', balance: balance.toString() });
}
```

---

### `apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` and other non-Pyth adapters

**Analog:** `apps/relayer/src/workers/cex-heartbeat.ts` — modular export structure; `apps/relayer/src/lib/kms-signer.ts` — EIP-712 signing with `gcpKmsAccount`

**KMS attestation signing pattern** (kms-signer.ts lines 85-165):
```typescript
// Each non-Pyth adapter signs an EIP-712 attestation with the matching KMS key
const account = gcpKmsAccount({
    projectId: process.env.GCP_PROJECT_ID!,
    locationId: 'us-east1',
    keyRingId: 'attestations',
    keyId: 'defillama',   // one of: 'nft-twap' | 'defillama' | 'cex' | 'snapshot-tally' | 'oauth-proof'
    keyVersion: process.env.GCP_KEY_VERSION_DEFILLAMA ?? '1',
    expectedAddress: process.env.KMS_ADDRESS_DEFILLAMA as Address,
});

const signature = await account.signTypedData({
    domain: {
        name: 'CallIt-DefiLlama',      // per-type domain name prevents cross-path replay (Pitfall 7)
        version: '1',
        chainId: 42161n,               // Arbitrum One chainId — hardcoded (Pitfall 7)
        verifyingContract: SETTLEMENT_MANAGER_ADDRESS,
    },
    types: { DefiLlamaAttestation: [...] },
    primaryType: 'DefiLlamaAttestation',
    message: { callId, metric, value, timestamp, chainId: 42161n },
});
```

**Pino structured logging pattern** (live-state.ts / kms-signer.ts):
```typescript
import { getLogger } from '../lib/logger.js';
const logger = getLogger();
logger.info({ event: 'defillama_adapter_fetch', callId: callId.toString(), metric }, 'DefiLlama fetch started');
logger.error({ event: 'defillama_adapter_error', error: String(err), callId: callId.toString() }, 'DefiLlama fetch failed');
```

---

### `apps/relayer/src/workers/oracle-adapters/cex/binance-scraper.ts` (× 8 exchanges)

**Analog:** `apps/relayer/src/workers/cex-heartbeat.ts` — existing stubs with the exact function signatures Phase 4 replaces

**Stub-to-real replacement pattern** (cex-heartbeat.ts lines 47-58):
```typescript
// Phase 4 replaces the body of emitHeartbeat() with actual Playwright scraping:
function createScraper(exchange: CexExchange): CexScraperStub {
    return {
        exchange,
        async scrape(tokenSymbol: string, tokenName: string): Promise<boolean> {
            // Phase 0: emitHeartbeat() stub
            // Phase 4: real Playwright scraping
            const browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto(EXCHANGE_ANNOUNCEMENT_URL[exchange]);
            // grep for token in post titles within 24h of expiry
            // apply INNOVATION_ZONE_EXCLUSION_PATTERNS[exchange] filter
            // multi-signal confirm: symbol AND full name match
        },
    };
}
```

**Per-exchange modular isolation** (cex-heartbeat.ts line 18 comment):
```typescript
// Per-exchange stubs are MODULAR (separate functions/files) because exchange
// announcement page structures change without warning — isolate selectors per exchange
export const CEX_EXCHANGES = ['binance','coinbase','okx','bybit','kraken','bitget','kucoin','upbit'] as const;
```

**Weekly CI synthetic test requirement** (D-02, Pitfall 10): each scraper file exports a `testWithFixture(staticHtml: string): boolean` function that the weekly CI cron calls with a known-listing HTML fixture. No analog exists — greenfield test export pattern.

---

### `apps/relayer/src/routes/settle.ts` and `apps/relayer/src/routes/disputes.ts` (routes, request-response)

**Analog:** `apps/relayer/src/routes/live-state.ts` (exact) and `apps/relayer/src/routes/duel-live-state.ts`

**Route module structure pattern** (live-state.ts lines 34-50):
```typescript
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import {
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,   // add to shared after deploy
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
```

**Fastify route handler pattern** (live-state.ts lines 179-210):
```typescript
export async function settleRoute(
    app: FastifyInstance,
    _opts: FastifyPluginOptions,
): Promise<void> {
    app.post<{ Params: { callId: string } }>(
        '/api/settle/:callId',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['callId'],
                    properties: { callId: { type: 'string' } },
                },
            },
        },
        async (request, reply) => {
            const logger = getLogger();
            let callId: bigint;
            try {
                callId = BigInt(request.params.callId);
            } catch {
                return reply.status(400).send({ error: 'invalid_call_id', message: 'callId must be a numeric string' });
            }
            // ... business logic
        },
    );
}
```

**Redis caching pattern** (live-state.ts lines 209-230):
```typescript
const key = `settle_state:${callId.toString()}`;
try {
    const cached = await redis.get(key);
    if (cached) {
        logger.info({ event: 'settle_state_cache_hit', callId: callId.toString() }, 'served from cache');
        reply.header('x-source', 'cache');
        return reply.send(JSON.parse(cached));
    }
} catch (err) {
    logger.warn({ event: 'settle_state_cache_read_failed', error: String(err) }, 'Redis cache read failed — proceeding to RPC');
}
```

**Error response pattern** (live-state.ts lines 375-383):
```typescript
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
        { event: 'settle_route_error', error: message, callId: callId.toString() },
        'Failed to process settle request',
    );
    return reply.status(502).send({ error: 'rpc_error', message: 'Failed to process settle request' });
}
```

**Privy auth gate** (for owner-only dispute resolve route): disputes.ts `GET /api/disputes` is public (no auth). `POST /api/disputes/resolve` is owner-gated — use `apps/relayer/src/lib/privy-auth.ts` pattern. See `apps/relayer/src/routes/admin-allowlist.ts` for the owner-gated pattern.

---

### `packages/subgraph/src/settlement-manager.ts` (subgraph mapping, event-driven)

**Analog:** `packages/subgraph/src/challenge-escrow.ts` (full file, 168 lines)

**Mapping file header pattern** (challenge-escrow.ts lines 1-12):
```typescript
// Phase 4 real handlers. Replaces Phase 0 stub. Pitfall E: handleBlock removed.
//
// Requirements: SETTLE-01..52, REP-25..27
// Spec: CALL_IT_SPEC1.md §12.4 — SettlementManager event schema
//
// AssemblyScript constraints (same as all mapping files):
//   - No closures
//   - No null for value types (BigInt.fromI32(0), '', false, new Bytes(0))
//   - @graphprotocol/graph-ts BigInt helpers required
//   - @entity(immutable: false) on Settlement, Dispute (status transitions)
//   - @entity(immutable: true) on RepEvent, ForceSettlement (append-only records)
```

**Import pattern** (challenge-escrow.ts lines 13-31):
```typescript
import { BigInt, Bytes } from '@graphprotocol/graph-ts';

import {
  CallSettled,
  DisputeRaised,
  DisputeResolved,
  CallForceSettled,
  SettlementDelayed,
  RepCalculated,
  RepCalculatedFallback,
} from '../generated/SettlementManager/SettlementManager';

import {
  Settlement, Dispute, DisputeResolution, ForceSettlement,
  SettlementDelayed as SettlementDelayedEntity, RepEvent,
  RepCalculatedFallback as RepCalculatedFallbackEntity,
  CategoryRep, LeaderboardEntry, Profile,
} from '../generated/schema';
```

**Lazy-init entity helper pattern** (challenge-escrow.ts lines 36-53):
```typescript
function ensureSettlement(callId: string): Settlement {
    let settlement = Settlement.load(callId);
    if (settlement == null) {
        settlement = new Settlement(callId);
        settlement.callId = BigInt.fromI32(0);
        settlement.outcome = 'Pending';
        settlement.oracle = '';
        settlement.settledAt = null;
        settlement.repDelta = BigInt.fromI32(0);
        settlement.txHash = new Bytes(0);
    }
    return settlement as Settlement;
}
```

**Event handler pattern** (challenge-escrow.ts lines 59-70):
```typescript
export function handleCallSettled(event: CallSettled): void {
    let callId = event.params.callId.toString();
    let settlement = ensureSettlement(callId);
    settlement.callId = event.params.callId;
    settlement.outcome = event.params.outcome == 1 ? 'CallerWon' : 'CallerLost';
    settlement.settledAt = event.block.timestamp;
    settlement.txHash = event.transaction.hash;
    settlement.save();

    // Update Call entity outcome + status
    let call = Call.load(callId);
    if (call != null) {
        call.status = 'Settled';
        call.outcome = settlement.outcome;
        call.save();
    }
}
```

**AssemblyScript BigInt arithmetic** (challenge-escrow.ts — uses `BigInt.fromI32(0)` for zero-init, never float):
```typescript
// RepEvent: record the delta as BigInt (AS has no float)
let repEvent = new RepEvent(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
repEvent.callId = event.params.callId;
repEvent.caller = event.params.caller;
repEvent.delta = event.params.delta;  // int256 — BigInt in AS
repEvent.newRep = event.params.newRep;  // uint128
repEvent.timestamp = event.block.timestamp;
repEvent.save();
```

---

### `packages/subgraph/subgraph.yaml` (update: add SettlementManager real address + eventHandlers; update FFM address)

**Analog:** existing `packages/subgraph/subgraph.yaml` ChallengeEscrow datasource block (lines 137-175):
```yaml
- kind: ethereum/contract
  name: SettlementManager
  network: arbitrum-sepolia
  source:
    address: "0x<SETTLEMENT_MANAGER_SEPOLIA_ADDRESS>"   # populated post-deploy
    abi: SettlementManager
    startBlock: <deploy_block>                           # from DeployPhase4.s.sol console output
  mapping:
    kind: ethereum/events
    apiVersion: 0.0.9
    language: wasm/assemblyscript
    file: ./src/settlement-manager.ts
    entities:
      - Settlement
      - Dispute
      - DisputeResolution
      - ForceSettlement
      - SettlementDelayed
      - RepCalculatedFallback
      - RepEvent
      - CategoryRep
      - LeaderboardEntry
    abis:
      - name: SettlementManager
        file: ./abis/SettlementManager.json
    # Pitfall E: NO blockHandlers — only eventHandlers (Phase 4 removes the Phase 0 stub)
    eventHandlers:
      - event: CallSettled(indexed uint256,uint8,int256)
        handler: handleCallSettled
      - event: DisputeRaised(indexed uint256,indexed address,bytes32)
        handler: handleDisputeRaised
      - event: DisputeResolved(indexed uint256,uint8)
        handler: handleDisputeResolved
      - event: CallForceSettled(indexed uint256,uint8)
        handler: handleCallForceSettled
      - event: SettlementDelayed(indexed uint256,string,uint256)
        handler: handleSettlementDelayed
      - event: RepCalculated(indexed uint256,indexed address,uint128,uint8,uint8,bool,uint256,int256)
        handler: handleRepCalculated
      - event: RepCalculatedFallback(indexed uint256,indexed address,int256,bytes)
        handler: handleRepCalculatedFallback
```
Also update the FollowFadeMarket datasource address to the new redeployed address + startBlock.

---

### `apps/web/app/call/[id]/page.tsx` (extend for Settled/Disputed/CallerExited states)

**Analog:** existing `apps/web/app/call/[id]/page.tsx` (self-extension) + `apps/web/app/duel/[challengeId]/page.tsx`

**Status-branch pattern** (call/[id]/page.tsx lines 76-80 — `status` field in CallData type):
```typescript
status: 'Live' | 'CallerExited' | 'Settled' | 'Disputed';
```
Phase 4 adds rendering branches for `Settled` and `Disputed`. Pattern: early-return or conditional section render based on `callData?.status`:
```typescript
const isSettled = callData?.status === 'Settled' || callData?.status === 'Disputed';
const isCallerExited = callData?.status === 'CallerExited';

// Outcome-word assignment (D-08 — per-viewer):
const outcomeWord = getOutcomeWord({
    outcome: callData?.outcome,
    fadeRealShare: callData?.fadeRealShare,
    repDelta: callData?.repDelta,
    viewerIsWinningFader,
});
```

**Imports pattern** (call/[id]/page.tsx lines 33-57):
```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import {
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,  // add from @call-it/shared after deploy
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  USDC_ARB_NATIVE,
} from '@call-it/shared';
```

**No wallet address rendered rule** (call/[id]/page.tsx line 65 comment):
```typescript
caller: string; // wallet address — only for internal logic, NEVER rendered (AUTH-44)
```

**FLEXBOX ONLY rule** (enforced across all web files — from page.tsx line 22):
```typescript
// FLEXBOX ONLY — no CSS grid (Pitfall 15).
```

---

### `apps/web/app/disputes/page.tsx` (new page, public log + owner resolve admin)

**Analog:** `apps/web/app/call/[id]/page.tsx` (page structure + relayer polling) + `apps/web/app/duel/[challengeId]/page.tsx`

**Page module structure** (duel/[challengeId]/page.tsx lines 22-43):
```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';
```

**Relayer polling pattern** (duel/[challengeId]/page.tsx — 5s fetch to relayer endpoint):
```typescript
useEffect(() => {
    if (!disputeId) return;
    const fetchState = async () => {
        try {
            const resp = await fetch(`${RELAYER_URL}/api/disputes/${disputeId}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setDisputeState(data);
        } catch (err) {
            // non-fatal — keep polling
        }
    };
    fetchState();
    const id = setInterval(fetchState, 5000);
    return () => clearInterval(id);
}, [disputeId]);
```

**Owner-gated action pattern** (from admin-allowlist.ts / admin-paymaster.ts route pattern — server-side Privy auth check):
```typescript
// Owner resolve admin section: only renders when connected wallet === owner address
const { user } = usePrivy();
const isOwner = user?.wallet?.address?.toLowerCase() === OWNER_ADDRESS.toLowerCase();
// Show resolveDispute(callId, finalOutcome) write button only when isOwner
```

---

### `apps/web/app/og/[callId]/route.ts` (extend: add variants 2 + 4)

**Analog:** existing `apps/web/app/og/[callId]/route.ts` (self-extension) + `apps/web/app/og/duel/[challengeId]/route.ts`

**Critical runtime declaration** (og/[callId]/route.ts line 25 — MUST be first export):
```typescript
export const runtime = 'nodejs';
// ^^^ CRITICAL: NOT 'edge'. resvg-wasm bundling fails on edge runtime.
// T-02-09-02: enforced; no display:grid anywhere in this file.
```

**Imports pattern** (og/[callId]/route.ts lines 27-38):
```typescript
import { type NextRequest } from 'next/server';
import { createElement as h, type ReactElement } from 'react';
import { ImageResponse } from '@vercel/og';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { renderFallback } from '@/lib/og-fallback-render';
import { syneBold, spaceGrotesk, jetBrainsMono } from '@/lib/og-fonts';
import {
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,  // add for settled-state read
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
```

**buildLiveCard function pattern** (og/[callId]/route.ts lines 138-200 — the full card builder):
```typescript
// buildSettledCard mirrors buildLiveCard exactly:
// - 1200×630, background #09090E, 3px #E8F542 border
// - ALL layout uses display:flex — Satori does NOT support display:grid (Pitfall 15)
// - cornerBracket() motif (4 corners)
// - Color per outcome word: CALLED IT = #E8F542, LOUD AND WRONG = #EF4444,
//   CONTRARIAN HIT = #22C55E, COLD CALL = #64748B, FADED CORRECTLY = #FB923C (§16.3/§15.7)
function buildSettledCard(props: SettledCardProps): ReactElement {
    return h('div', {
        style: {
            width: '1200px',
            height: '630px',
            background: '#09090E',
            display: 'flex',   // PITFALL 15
            flexDirection: 'column',
            position: 'relative',
            border: '3px solid #E8F542',
        },
    }, ...);
}
```

**renderFallback + error pattern** (og/[callId]/route.ts — exact pattern):
```typescript
} catch (err) {
    // T-02-09-02: NEVER return 500 — always render fallback card
    return renderFallback(request, 'settled-data-error');
}
```

**Cache-bust via ?v= param pattern** (og/[callId]/route.ts — statusVersion):
```typescript
// ?v={statusVersion} from Redis status_version:{callId} — forces CDN cache miss on state change
const statusVersion = searchParams.get('v') ?? '0';
```

---

### `apps/web/app/og/duel/[challengeId]/route.ts` (fill settled-field stubs)

**Analog:** existing file itself (Phase 3 stubs at lines 15-32):
```typescript
// STUB CONTRACT (D-11 — active-duel Phase 3):
//   - winner highlight: both columns at full opacity (1.0)
//   - WINS/VS text: "VS" in Syne 64px 700 #64748B (not "WINS")
//   - winner handle color: #F1F5F9 neutral (not #E8F542)
//   - rep deltas: "? REP" in #94A3B8
```
Phase 4 fills: when `challenge.status === 4` (Settled) and `challenge.winner !== ZERO_ADDRESS`:
- WINS/VS text → "WINS" in `#E8F542`
- Winner column → full opacity (1.0); loser column → opacity 0.4
- Winner handle color → `#E8F542`
- Rep deltas → real `repDelta` values from subgraph (queried via relayer route)

**ABI inline pattern** (og/duel/[challengeId]/route.ts lines 50-79 — already exists):
```typescript
const challengeEscrowAbi = [
    {
        type: 'function',
        name: 'getChallenge',
        // Field ORDER must exactly match IChallengeEscrow.Challenge struct
        // (viem decodes positionally -- wrong order = wrong values)
        ...
    },
] as const;
```

---

### `packages/shared/src/constants/addresses.ts` (update)

**Analog:** existing `packages/shared/src/constants/addresses.ts` (self-extension)

**Constant declaration pattern** (addresses.ts lines 92-168 — existing entries):
```typescript
/**
 * SettlementManager on Arbitrum Sepolia (Phase 4 deploy).
 *
 * DEPLOYED [DATE] via DeployPhase4.s.sol. Deploy block: [BLOCK].
 * Constructor: (CallRegistry, FollowFadeMarket v2, ChallengeEscrow, ProfileRegistry,
 *               USDC_ARB_NATIVE, treasury, PYTH_ARBITRUM_SEPOLIA).
 *
 * Post-deploy verification (on-chain, all green):
 *   settlementManager() on CR → this address ✓
 *   settlementManager() on FFM v2 → this address ✓
 *   settlementManager() on CE → this address ✓
 *   authorizedRepWriters(this) on PR → true ✓
 *
 * Threat: T-04-XX — wrong address prevents settlement.
 */
export const SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA =
    '0x0000000000000000000000000000000000000000' as const; // placeholder — update post-deploy

export const SETTLEMENT_MANAGER_ARBITRUM_ONE =
    '0x0000000000000000000000000000000000000000' as const;

// FollowFadeMarket v2 (redeployed in Phase 4 — adds applySettlement + real claimPayout)
// Update FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA to new address post-deploy.
// The old address 0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362 is superseded.
```

**AddressRecord pattern** (addresses.ts lines 61-70):
```typescript
export const SETTLEMENT_MANAGER_ADDRESSES: AddressRecord = {
    [ARBITRUM_MAINNET_CHAIN_ID]: SETTLEMENT_MANAGER_ARBITRUM_ONE,
    [ARBITRUM_SEPOLIA_CHAIN_ID]: SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
};
```

---

## Shared Patterns

### CEI (Checks-Effects-Interactions) on all USDC transfer paths
**Source:** `packages/contracts/src/ChallengeEscrow.sol` (lines 235-243, 328-341, 365-369)
**Apply to:** SettlementManager (dispute bond custody), FollowFadeMarket (claimPayout, applySettlement), all new Solidity functions that touch USDC
```solidity
// ── Gates ──
// (validate state before effects)

// ── EFFECTS: ALL state writes BEFORE safeTransfer (CEI, T-3-02-01) ──
claimed[callId][msg.sender] = true;
// NOTE: Any reviewer: if you see safeTransfer BEFORE a state write, that is a bug.

// ── INTERACTIONS ──
IERC20(USDC_ARB_NATIVE).safeTransfer(recipient, amount);
```

### USDC-only mandate + CI grep guard
**Source:** `packages/contracts/src/ChallengeEscrow.sol` (lines 8-9) + `packages/contracts/src/constants/USDC.sol`
**Apply to:** SettlementManager and FollowFadeMarket v2
```solidity
// USDC MANDATE (§10.5): ALL transfer paths use USDC_ARB_NATIVE from ./constants/USDC.sol.
// Never paste the literal address in this file. The CI grep guard will catch it.
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
require(_usdc == USDC_ARB_NATIVE, "wrong-usdc");  // constructor gate
```

### Solidity pragma pin
**Source:** every existing contract + interface (line 2)
**Apply to:** all new Solidity files
```solidity
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
```

### KMS signing for all relayer attestations
**Source:** `apps/relayer/src/lib/kms-signer.ts` (lines 43-48, 85-165)
**Apply to:** all 7 oracle adapter modules
```typescript
// AttestationType union — 5 keys, one per adapter class (D-07)
export type AttestationType = 'nft-twap' | 'defillama' | 'cex' | 'snapshot-tally' | 'oauth-proof';

// Boot-time address verification (T-00-17)
await verifyKmsAddress({ projectId, locationId, keyRingId, keyId, keyVersion, expectedAddress });

// Signing — NEVER a local private key
const account = gcpKmsAccount({ projectId, locationId, keyRingId, keyId, keyVersion, expectedAddress });
const sig = await account.signTypedData({ domain: { chainId: 42161n, verifyingContract: SM_ADDRESS }, ... });
```

### Pino structured logging in relayer workers and routes
**Source:** `apps/relayer/src/routes/live-state.ts` (lines 213-228) + `apps/relayer/src/lib/kms-signer.ts` (lines 120-127)
**Apply to:** all new relayer workers and routes
```typescript
import { getLogger } from '../lib/logger.js';
const logger = getLogger();
logger.info({ event: 'settlement_watcher_tick', callId: callId.toString() }, 'settlement tick started');
logger.error({ event: 'settlement_failed', error: message, callId: callId.toString() }, 'settlement failed');
// event field is REQUIRED — used for structured log search and alert routing
```

### Redis cache pattern in relayer routes
**Source:** `apps/relayer/src/routes/live-state.ts` (lines 209-330) + `apps/relayer/src/routes/duel-live-state.ts`
**Apply to:** settle route, disputes route
```typescript
const CACHE_TTL_SECONDS = 4;
const key = `settle_state:${callId.toString()}`;
try {
    const cached = await redis.get(key);
    if (cached) { reply.header('x-source', 'cache'); return reply.send(JSON.parse(cached)); }
} catch (err) {
    logger.warn({ event: 'cache_read_failed', error: String(err) }, 'Redis cache read failed — proceeding to RPC');
}
// ... fetch from RPC ...
try {
    await redis.set(key, JSON.stringify(responseData), 'EX', CACHE_TTL_SECONDS);
} catch (cacheErr) {
    logger.warn({ event: 'cache_write_failed', error: String(cacheErr) }, 'Redis cache write failed — response not cached');
}
```

### Subgraph lazy-init entity helper
**Source:** `packages/subgraph/src/challenge-escrow.ts` (lines 36-53) + `packages/subgraph/src/call-registry.ts` (lines 27-46)
**Apply to:** `settlement-manager.ts` entity helpers (Settlement, Dispute, RepEvent)
```typescript
function ensureEntity(id: string): EntityType {
    let entity = EntityType.load(id);
    if (entity == null) {
        entity = new EntityType(id);
        entity.fieldName = BigInt.fromI32(0); // AS: never null for value types
        entity.stringField = '';
        entity.bytesField = new Bytes(0);
        entity.nullableBigInt = null;          // AS: null OK for nullable fields
    }
    return entity as EntityType;
}
```

### OG route: nodejs runtime + flexbox-only + renderFallback
**Source:** `apps/web/app/og/[callId]/route.ts` (lines 25, 108-113, 152-154)
**Apply to:** all OG route extensions (variants 2, 4 in the same file; duel variant 3 stub-fill)
```typescript
export const runtime = 'nodejs';  // FIRST EXPORT — CRITICAL. Never 'edge'.

// ALL layout uses display:flex — Satori does NOT support display:grid (Pitfall 15)
style: { display: 'flex', flexDirection: 'column' }  // never display:grid

// On any data failure: renderFallback, never 500
} catch (err) {
    return renderFallback(request, 'error-reason-string');
}
```

### Shared constants import — never inline addresses
**Source:** `apps/web/app/call/[id]/page.tsx` (lines 47-57) + `apps/relayer/src/routes/live-state.ts` (lines 40-43)
**Apply to:** all new frontend pages, relayer routes, and subgraph.yaml
```typescript
import {
    SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
    FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
    CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
// NEVER inline hex addresses in any file. CI grep guard will catch literal 0xaf88...
```

### Telegram alert on settlement failure/stuck
**Source:** `apps/relayer/src/workers/alerts.ts` (lines 46-58)
**Apply to:** settlement watcher, oracle adapters (on ambiguous read + 30-retry exhaustion)
```typescript
import { sendAlert } from './alerts.js';
// Existing alert events cover settlement needs:
await sendAlert('settle_failed', { callId: callId.toString(), reason, retries: 30 });    // P0
await sendAlert('settle_stuck_25m', { callId: callId.toString(), minutesStuck: 25 });   // P1
await sendAlert('dispute_raised', { callId: callId.toString(), disputer, bondAmount });  // P0
await sendAlert('rep_fallback', { callId: callId.toString(), error: lowLevelErr });      // P0
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` | service | request-response | No Pyth pull-oracle adapter exists in the codebase. Must be built from RESEARCH.md patterns: `HermesClient.getLatestPriceUpdates()`, `pyth.getUpdateFee()`, `pyth.updatePriceFeeds{value: fee}()`. The `polled-events-fallback.ts` gives the error-resilience skeleton but not the oracle logic. |
| Playwright CEX scraper bodies (8 files) | service | event-driven | `cex-heartbeat.ts` provides the exact shell (function names, export structure, modular isolation) but the body is a Phase-0 stub with `getLogger().info(...)`. Phase 4 fills the Playwright headless Chrome logic. No working Playwright scraper exists to copy from. |

---

## Metadata

**Analog search scope:** `packages/contracts/src/`, `packages/contracts/script/`, `packages/contracts/test/`, `apps/relayer/src/`, `packages/subgraph/src/`, `apps/web/app/`, `packages/shared/src/constants/`
**Files scanned:** 22 source files read + directory listings
**Pattern extraction date:** 2026-06-01
