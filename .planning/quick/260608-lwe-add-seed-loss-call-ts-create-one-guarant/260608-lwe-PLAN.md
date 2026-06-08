---
phase: quick-260608-lwe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/relayer/src/scripts/seed-loss-call.ts
autonomous: true
requirements: [SC1-OG-OUTCOME-WORD-BASELINES]
must_haves:
  truths:
    - "Running SEED_DRY_RUN=1 npx tsx src/scripts/seed-loss-call.ts from apps/relayer prints the plan (caller address, caller USDC balance, target 100000000000000, expiry) and exits 0 WITHOUT broadcasting any transaction"
    - "tsc --noEmit for the relayer package exits 0 with the new file present"
    - "A live (non-dry-run) run creates ONE PriceTarget call whose target (100000000000000 = $1,000,000 Pyth-8dp) guarantees CallerLost on settle, unlocking the LOUD AND WRONG + FADED CORRECTLY OG outcome-word baselines"
  artifacts:
    - path: "apps/relayer/src/scripts/seed-loss-call.ts"
      provides: "Sepolia seed script creating one guaranteed-CallerLost PriceTarget call with a SEED_DRY_RUN gate"
      contains: "SEED_DRY_RUN"
      min_lines: 120
  key_links:
    - from: "apps/relayer/src/scripts/seed-loss-call.ts"
      to: "@call-it/shared CALL_REGISTRY_ARBITRUM_SEPOLIA"
      via: "import (no inlined CallRegistry hex)"
      pattern: "CALL_REGISTRY_ARBITRUM_SEPOLIA"
    - from: "apps/relayer/src/scripts/seed-loss-call.ts"
      to: "CallRegistry.createCall (12-arg)"
      via: "viem writeContract guarded by SEED_DRY_RUN"
      pattern: "functionName:\\s*'createCall'"
---

<objective>
Create a single new Sepolia seed script — `apps/relayer/src/scripts/seed-loss-call.ts` — that creates ONE guaranteed-CallerLost PriceTarget call so the Phase-7 SC1 OG outcome-word baselines for **LOUD AND WRONG** (`/og/<id>`) and **FADED CORRECTLY** (`/og/<id>?as=fader`) can be captured.

Both missing outcome words derive from a single CallerLost call: the OG route renders LOUD AND WRONG for the caller view and FADED CORRECTLY for the fader view on any CallerLost call. No CallerLost call currently exists on Sepolia (call 8 = CALLED IT, call 11 = COLD CALL), so this script seeds one.

The guarantee comes from `targetValue = 100000000000000n` ($1,000,000 in Pyth 8-dp). `SettlementManager._settlePyth` does `currentPrice >= target ? CallerWon : CallerLost`; ETH (~$3.5k = ~3.5e11 in 8-dp) is far below 1e14, so the call settles CallerLost deterministically once settled via the existing `settle-pyth-calls.ts`.

Purpose: Unblock the operator-pending SC1 200px outcome-word baselines without touching any other file.
Output: One new TypeScript script with a dry-run verification gate. No edits elsewhere.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

# Sibling scripts to mirror EXACTLY (env-load, normalizeKey, viem clients, evidence-append, 12-arg createCall + CallCreated readback)
@apps/relayer/src/scripts/settle-pyth-calls.ts
@apps/relayer/src/scripts/soak-seeder.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create seed-loss-call.ts (one guaranteed-CallerLost PriceTarget call, SEED_DRY_RUN gated)</name>
  <files>apps/relayer/src/scripts/seed-loss-call.ts</files>
  <action>
Create the single new file `apps/relayer/src/scripts/seed-loss-call.ts`. Do NOT edit any other file. Testnet-only; never log private keys; never stage `packages/contracts/lib/openzeppelin-contracts`.

HEADER + ENV LOADING: Open with a doc comment stating the purpose (seed ONE guaranteed-CallerLost PriceTarget call to unlock the SC1 LOUD AND WRONG + FADED CORRECTLY OG baselines) and the usage line `npx tsx src/scripts/seed-loss-call.ts` (plus the `SEED_DRY_RUN=1` variant). Copy the `__dirname` + `loadEnvIfNeeded()` pattern verbatim from settle-pyth-calls.ts (the same three `.env.local` candidate paths via `resolve(__dirname, '../../.env.local')` etc., guarded by `process.env.ARBITRUM_SEPOLIA_RPC_URL && process.env.SOAK_WALLET_0`), and call `loadEnvIfNeeded()` BEFORE the viem imports — identical ordering to the siblings (env load runs before `import { createPublicClient ... }`).

IMPORTS: After the env load — `import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog } from 'viem'`; `import { privateKeyToAccount } from 'viem/accounts'`; `import { arbitrumSepolia } from 'viem/chains'`; and `import { CALL_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared'`. Do NOT inline the CallRegistry hex address (use the shared constant). Also import the fs/path helpers (`appendFileSync, existsSync, mkdirSync` from 'node:fs'; `resolve, dirname` from 'node:path'; `fileURLToPath` from 'node:url') as the siblings do.

CONSTANTS:
- `USDC = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'` (Circle Sepolia USDC; typed `as const` `0x${string}`).
- `ETH_FEED = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'` inline string (matches soak-seeder precedent; passed to `BigInt(ETH_FEED)` at createCall — assetA is the allowlisted ETH/USD Pyth feed id).
- `MIN_STAKE = 5_000000n` ($5 min stake) and a top-up ceiling `5_500000n`.
- Evidence path mirroring settle-pyth-calls.ts: `resolve(__dirname, '../../../../evidence/phase-6-soak/seed-loss-${Date.now()}.jsonl')`, with an `appendEvidence(entry)` helper that mkdir -p's `evidence/phase-6-soak` and appendFileSync's `JSON.stringify(entry) + '\n'` (copy the helper shape from settle-pyth-calls.ts).
- `CALL_REGISTRY = (process.env.CALL_REGISTRY_ADDRESS as 0x${string} | undefined) ?? CALL_REGISTRY_ARBITRUM_SEPOLIA` (env override precedence, matching soak-seeder).

normalizeKey HELPER: Copy `normalizeKey` VERBATIM from settle-pyth-calls.ts (trims, rejects empty/`<...>` placeholders, prepends `0x`, validates `/^0x[0-9a-fA-F]{64}$/`, returns `0x${string} | null`).

ABIs:
- `CALL_REGISTRY_ABI` — copy the 12-arg `createCall` line + the `CallCreated` event line VERBATIM from soak-seeder.ts (`parseAbi(['function createCall(uint8 marketType, uint8 eventSubtype, uint8 category, uint256 assetA, uint256 assetB, uint256 targetValue, uint64 expiry, uint96 stake, uint8 conviction, bytes32 criteriaHash, bool openToChallenges, uint256 parentCallId) returns (uint256 callId)', 'event CallCreated(uint256 indexed id, address indexed caller, uint8 marketType, uint96 stake)'])`).
- `ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)', 'function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'])`.

MAIN LOGIC (ordered, async main()):
1. Read `rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL`; if missing or starts with `<`, console.error + `process.exit(1)` (mirror settle-pyth-calls.ts). Build `publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) })`.
2. Load SOAK_WALLET_0..SOAK_WALLET_9 via `normalizeKey(process.env[`SOAK_WALLET_${i}`])` into an array; keep them paired with their index (skip invalid → null).
3. `callerIndex = Number(process.env.SEED_CALLER_INDEX ?? 2)`; require a valid normalized key at that index (else console.error + exit 1). `callerAccount = privateKeyToAccount(callerKey)`; `caller = callerAccount.address`.
4. Read `callerBal = ERC20.balanceOf(caller)`. Compute booleans: `needsConsolidation = callerBal < MIN_STAKE` and `needsApproval` (determined after reading allowance below; for dry-run, read allowance and compute the boolean WITHOUT sending).
5. `expiry = BigInt(Math.floor(Date.now()/1000) + Number(process.env.SEED_EXPIRY_SECONDS ?? 150))`; `target = 100000000000000n`.

6. DRY-RUN GATE — `if (process.env.SEED_DRY_RUN === '1')`: print caller address, caller USDC balance (raw and `/1e6`), whether consolidation would be needed (`needsConsolidation`), whether approval would be needed (`needsApproval`), `target` (100000000000000), and `expiry` + seconds-until-expiry; then `process.exit(0)` IMMEDIATELY — BEFORE any transfer/approve/createCall. No transaction of any kind may be sent on the dry-run path.

7. LIVE PATH (only reached when SEED_DRY_RUN !== '1'):
   a. Consolidation: while `callerBal < 5_500000n`, scan the OTHER soak wallets (skip the caller index), read each donor's `ERC20.balanceOf`, and for any donor holding USDC, send `ERC20.transfer(caller, amount)` from that donor's wallet client (transfer up to what closes the gap to 5_500000n, capped at the donor's balance), `await publicClient.waitForTransactionReceipt`, log `donor 0x.. -> caller 0x.. : N USDC` (addresses + amounts only — NEVER keys), then re-read `callerBal`. Stop when `callerBal >= 5_500000n` or donors exhausted. If still `< MIN_STAKE`, console.error + exit 1.
   b. Allowance/approve: read `ERC20.allowance(caller, CALL_REGISTRY)`; if `< MIN_STAKE`, send `ERC20.approve(CALL_REGISTRY, MIN_STAKE)` from the caller wallet client and await its receipt.
   c. createCall: from the caller wallet client, `writeContract({ address: CALL_REGISTRY, abi: CALL_REGISTRY_ABI, functionName: 'createCall', args: [0, 0, 0, BigInt(ETH_FEED), 0n, target, expiry, MIN_STAKE, 50, '0x0000000000000000000000000000000000000000000000000000000000000001', false, 0n], account: callerAccount, chain: arbitrumSepolia })`. Await the receipt; capture `blockNumber` and `txHash`.
   d. Read the new callId: `publicClient.getLogs({ address: CALL_REGISTRY, event: CALL_REGISTRY_ABI[1], fromBlock: blockNumber, toBlock: blockNumber })`; `callId = logs.length > 0 ? Number(logs[logs.length - 1].args.id) : null` (the last matching CallCreated log — same readback as soak-seeder phaseA). If null, log a warning but continue printing the tx hash.
   e. Print: new callId, expiry unix ts, seconds-until-settle-able (`Number(expiry) - Math.floor(Date.now()/1000)`), and the exact follow-up command `npx tsx src/scripts/settle-pyth-calls.ts <callId>` to run AFTER expiry — note the expected outcome is CallerLost = LOUD AND WRONG, after which `/og/<callId>` renders LOUD AND WRONG and `/og/<callId>?as=fader` renders FADED CORRECTLY.
   f. `appendEvidence({ action: 'lossCallCreated', callId, txHash, target: target.toString(), expiry: Number(expiry), timestamp: Date.now() })`.
   g. `process.exit(0)`.

8. Bottom: `main().catch((err) => { console.error('seed-loss-call: fatal error:', err); process.exit(1); })` (mirror the siblings).

BigInt serialization note: when appending evidence, stringify `target` (a bigint) to avoid JSON.stringify throwing on bigint; `expiry` may be emitted as `Number(expiry)`.
  </action>
  <verify>
    <automated>pnpm --filter @call-it/relayer exec tsc --noEmit</automated>
    <automated>powershell -NoProfile -Command "$env:SEED_DRY_RUN='1'; Set-Location 'C:\Users\woshv\Desktop\Call it\apps\relayer'; npx tsx src/scripts/seed-loss-call.ts; exit $LASTEXITCODE"</automated>
  </verify>
  <done>
File `apps/relayer/src/scripts/seed-loss-call.ts` exists. `tsc --noEmit` for the relayer exits 0. `SEED_DRY_RUN=1 npx tsx src/scripts/seed-loss-call.ts` (run from apps/relayer) prints the plan (caller address, caller USDC balance, target 100000000000000, expiry) and exits 0 WITHOUT broadcasting any transaction. No other file is modified; the openzeppelin-contracts submodule is not staged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| script → Arbitrum Sepolia RPC | Script signs and broadcasts USDC transfers/approve + CallRegistry.createCall using SOAK_WALLET_N private keys read from env (testnet-only) |
| env → script | Private keys (SOAK_WALLET_0..9) loaded from apps/relayer/.env.local; never logged, never committed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lwe-01 | Information Disclosure | private key logging | mitigate | Logs emit only addresses + USDC amounts ("donor 0x.. -> caller 0x.. : N USDC"); never the key. normalizeKey rejects placeholders so no partial key echoes. |
| T-lwe-02 | Elevation of Privilege | accidental live broadcast during verification | mitigate | SEED_DRY_RUN=1 gate exits 0 BEFORE any transfer/approve/createCall; executor verification MUST use the dry-run path only. |
| T-lwe-03 | Tampering | hardcoded mainnet address risk | accept | USDC is the Circle Sepolia testnet address (0x75faf114…); CallRegistry comes from the shared @call-it/shared Sepolia constant — no mainnet hex inlined. Testnet-only blast radius. |
| T-lwe-04 | Tampering | submodule staged | mitigate | Single new file under apps/relayer/src/scripts/; packages/contracts/lib/openzeppelin-contracts must never be staged. |
| T-lwe-SC | Tampering | npm/pip/cargo installs | mitigate | No new packages installed — viem 2.50.4 + @call-it/shared already in the relayer dependency surface; no install step. |
</threat_model>

<verification>
- `pnpm --filter @call-it/relayer exec tsc --noEmit` exits 0 with the new file present.
- `SEED_DRY_RUN=1 npx tsx src/scripts/seed-loss-call.ts` (from apps/relayer) prints caller address + USDC balance + target 100000000000000 + expiry and exits 0, with NO transaction broadcast.
- Executor MUST NOT run the script without `SEED_DRY_RUN=1` — a live run broadcasts on-chain txns (operator/orchestrator step, out of scope).
- `git status` shows only `apps/relayer/src/scripts/seed-loss-call.ts` added; the openzeppelin-contracts submodule is not staged.
</verification>

<success_criteria>
- One new file `apps/relayer/src/scripts/seed-loss-call.ts`, no edits elsewhere.
- Mirrors sibling conventions: env-load via process.loadEnvFile, normalizeKey, viem createPublicClient/createWalletClient on arbitrumSepolia, evidence-append to evidence/phase-6-soak/.
- CallRegistry address from @call-it/shared (no inlined hex); 12-arg createCall + CallCreated readback copied from soak-seeder.
- target = 100000000000000n guarantees CallerLost on settle (ETH << $1M in 8-dp).
- SEED_DRY_RUN=1 prints the plan and exits 0 before broadcasting.
- typecheck green; private keys never logged; submodule never staged.
</success_criteria>

<output>
Create `.planning/quick/260608-lwe-add-seed-loss-call-ts-create-one-guarant/260608-lwe-SUMMARY.md` when done
</output>
