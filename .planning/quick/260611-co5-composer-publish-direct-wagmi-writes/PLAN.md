---
phase: quick-260611-co5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/lib/abis/erc20.ts
  - apps/web/lib/abis/index.ts
  - apps/web/app/new/lib/call-created-log.ts
  - apps/web/app/new/hooks/usePublishCall.ts
  - apps/web/app/new/components/PublishConfirmModal.tsx
  - apps/web/tests/call-created-log.test.ts
  - apps/web/tests/new-call-publish.spec.ts
autonomous: true
requirements: [QUICK-260611-CO5]

must_haves:
  truths:
    - "Publishing from /new submits a REAL on-chain flow via the connected EOA: USDC approve (when allowance short) then CallRegistry.createCall — no AA stub in the path"
    - "A wallet with 0 Sepolia ETH gets an explicit faucet-direction error toast BEFORE any tx is attempted"
    - "Contract reverts surface the decoded errorName (AssetNotAllowlisted gets a human message); user-rejected signatures surface honestly; never a silent stall"
    - "Successful publish redirects to /call/{callId} (the receipt page) extracted from the CallCreated log"
  artifacts:
    - path: "apps/web/app/new/lib/call-created-log.ts"
      provides: "Pure extractCallIdFromLogs + extractRevertErrorName + isUserRejection helpers"
    - path: "apps/web/lib/abis/erc20.ts"
      provides: "Minimal USDC ABI (allowance/balanceOf/approve) copied from the proven ChallengeFormModal inline ABI"
    - path: "apps/web/tests/call-created-log.test.ts"
      provides: "Unit tests for callId extraction (valid / unrelated / garbage / wrong-address / empty)"
  key_links:
    - from: "apps/web/app/new/hooks/usePublishCall.ts"
      to: "wagmi/actions"
      via: "writeContract / waitForTransactionReceipt / readContract / getBalance bound to wagmiConfig"
      pattern: "from 'wagmi/actions'"
    - from: "apps/web/app/new/hooks/usePublishCall.ts"
      to: "@/lib/chain"
      via: "chainId: ACTIVE_CHAIN_ID + USDC_ADDRESS + CALL_REGISTRY_ADDRESS on every action call"
      pattern: "chainId: ACTIVE_CHAIN_ID"
    - from: "apps/web/app/new/hooks/usePublishCall.ts"
      to: "/call/[id]"
      via: "router.push after extractCallIdFromLogs on the createCall receipt"
      pattern: "router\\.push\\(`/call/"
---

<objective>
Wire the composer's publish submission for real. The composer (/new) is the ONLY money flow
still on a dead Account-Abstraction path: `createAaClient()` at `apps/web/lib/aa-config.ts:97-108`
is an explicit stub whose `sendUserOperation` / `waitForUserOperationReceipt` both throw
'AA client not yet wired — implement in Plan 07'. Verified live 2026-06-11 (deployed app, real
authenticated session): preflight returns 200 {ok:true, hash:0x500968…} — the quick-260611-bf2
wire-contract fixes (ae29569/676e618/ca7ad70) work — then step 3 of usePublishCall.ts ALWAYS
throws. Every other money flow (ChallengeFormModal.tsx:224/257/277 writeContractAsync,
call/[id]/page.tsx:576/1409, duel page) already uses direct wagmi writes.

Replace step 3 with a sequential direct-EOA flow: gas guard → USDC allowance/approve →
CallRegistry.createCall → extract callId from the CallCreated log → redirect to `/call/{callId}`.
No Privy gas sponsorship is configured (privy-config.ts has none), so direct EOA writes need
Sepolia ETH for gas — the session wallet 0x73047a882e0B88a1913A25bBe8d871aBad2c5CeD holds
$20 USDC and 0 ETH right now, hence the mandatory gas guard with faucet direction.

Purpose: the receipt is the product. Publish must produce a real on-chain call.
Output: working publish path in apps/web ONLY, single atomic commit, helper unit tests.
</objective>

<context>
@apps/web/app/new/hooks/usePublishCall.ts
@apps/web/lib/aa-config.ts
@apps/web/lib/chain.ts
@apps/web/lib/wagmi.ts
@apps/web/lib/abis/CallRegistry.ts
@apps/web/lib/abis/index.ts
@apps/web/app/new/components/PublishConfirmModal.tsx
@apps/web/app/components/ChallengeFormModal.tsx
@apps/web/tests/new-call-publish.spec.ts

**Pre-verified facts (planner confirmed against source 2026-06-11 — do NOT re-litigate):**

1. **`@wagmi/core` is NOT importable in apps/web.** It exists only as a transitive dep of
   `wagmi@2.18.0` in the pnpm store (`@wagmi+core@2.22.0`), not in apps/web/package.json —
   pnpm strict isolation would fail the import. USE `wagmi/actions` instead: wagmi v2
   re-exports all core actions (getBalance, readContract, writeContract,
   waitForTransactionReceipt); each takes the config as first arg. Bind to `wagmiConfig`
   from `apps/web/lib/wagmi.ts` (createConfig from `@privy-io/wagmi`, so the Privy
   embedded-wallet connector is wired — actions use the current connection automatically;
   no `account` param needed).

2. **The CallCreated event ALREADY EXISTS in the web ABI stub** at
   `apps/web/lib/abis/CallRegistry.ts:18-27` (id uint256 indexed, caller address indexed,
   marketType uint8, stake uint96), matching the canonical
   `packages/contracts/src/interfaces/ICallRegistry.sol:65`. No ABI addition needed. The
   stub ALSO already contains the custom errors AssetNotAllowlisted (line 50), DuplicateCall
   (61), TvlCapReached (66), InsufficientUsdcAllowance, InsufficientUsdcBalance — so viem
   decodes revert errorNames during writeContract's gas-estimation phase.

3. **There is NO erc20 ABI file in apps/web/lib/abis/** (only CallRegistry, ChallengeEscrow,
   FollowFadeMarket, ProfileRegistry, index). The proven minimal USDC ABI
   (allowance/balanceOf/approve, `as const`) lives INLINE at
   `apps/web/app/components/ChallengeFormModal.tsx:62-90` under
   "/** Minimal USDC ABI for allowance + approve */". Copy that exact ABI into the new
   `apps/web/lib/abis/erc20.ts` — never hand-write a fresh one; do NOT refactor
   ChallengeFormModal (out of scope, keep the diff minimal).

4. **CREATION_FEE = 10_000_000n** ($10 USDC, 6 decimals), exported from `@call-it/shared`
   (packages/shared/src/validation/call-gates.ts:47, re-exported index.ts:123).
   PublishConfirmModal already imports it for the fee-disclosure row.

5. **Vitest only runs `tests/**/*.test.ts`** (apps/web/vitest.config.ts, environment node,
   `@` alias → apps/web root). The new unit test MUST be named
   `apps/web/tests/call-created-log.test.ts`. The 22 existing .test.ts files must stay green.

6. **Two Tier-1 static assertions in `apps/web/tests/new-call-publish.spec.ts` (Playwright,
   NOT vitest) WILL BREAK** when sendUserOperation and the sponsorship-cap branch are removed:
   (a) 'usePublishCall calls postPreflight before sendUserOperation (D-28)' (lines 111-119,
   uses source.indexOf('sendUserOperation')); (b) 'usePublishCall handles
   sponsorship-cap-exceeded via Circle paymaster (Plan 07)' (lines 121-125, asserts
   'sponsorship-cap-exceeded' + buildPaymasterAndData|useCirclePaymaster in source). Both
   must be updated in Task 3. NO other test scans usePublishCall.ts (verified:
   paymaster-cap-handoff.spec.ts and chain-pinning.test.ts scan different files;
   usePublishCall.ts is not in chain-pinning's HOOK_FILES list, but the new code follows the
   `chainId: ACTIVE_CHAIN_ID` convention anyway).

7. **PublishConfirmModal step rendering**: line 51 gates the spinner view with
   isSigning = isPublishing && (publishStep === 'preflight' || 'signing' || 'waiting');
   lines 206-209 map step → copy ('Running gate checks...', 'Please sign in your wallet...',
   'Waiting for on-chain confirmation...'). The new 'approving' step must be added to BOTH.

8. **Quote mode in apps/web/app/new/page.tsx (~lines 184-195) must NOT be touched.** Today
   the hook redirects unconditionally while page.tsx separately sets the quote success
   screen; switching the redirect target from /profile/{address} to /call/{callId} keeps
   behavior parity (navigation still wins). Leave page.tsx alone.

9. **Repo is dirty with UNRELATED files** (see Task 4 staging rules): the
   packages/contracts/lib/openzeppelin-contracts submodule, 'call it frontend/', docs/,
   evidence/, .planning/, both .gitignore files, .claude/launch.json,
   apps/relayer/src/scripts/soak-*.sh, apps/web/tests/visual-smoke.spec.ts-snapshots/
   must NEVER be staged.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure helpers — erc20 ABI module + CallCreated log extraction + unit tests</name>
  <files>apps/web/lib/abis/erc20.ts, apps/web/lib/abis/index.ts, apps/web/app/new/lib/call-created-log.ts, apps/web/tests/call-created-log.test.ts</files>
  <behavior>
    - Test 1 (valid log): log whose address equals the registry address and whose topics/data
      encode CallCreated(id=14n, caller=0x7304…, marketType=0, stake=5_000_000n) → returns 14n.
      Build the fixture with viem encodeEventTopics({ abi: callRegistryAbi, eventName:
      'CallCreated', args: { id, caller } }) for topics and encodeAbiParameters for the
      non-indexed tail (uint8 marketType, uint96 stake).
    - Test 2 (unrelated event): log from the same address with CallQuoted topics → null.
    - Test 3 (garbage log): random/short topics + garbage data → null (no throw).
    - Test 4 (wrong address): structurally valid CallCreated log from a DIFFERENT contract → null;
      address compare must be case-insensitive (fixture uses mixed-case address).
    - Test 5 (empty logs array): → null.
    - No fake-DOM theater: pure node-environment vitest, real viem decode, no mocks.
  </behavior>
  <action>
    1. Create apps/web/lib/abis/erc20.ts: copy the minimal USDC ABI VERBATIM from
       ChallengeFormModal.tsx:62-90 (allowance, balanceOf, approve; `as const`), export as
       `erc20Abi`. Header comment: source attribution + intentionally minimal
       (quick-260611-co5). Add `export { erc20Abi } from './erc20';` to
       apps/web/lib/abis/index.ts. Do NOT modify ChallengeFormModal.
    2. Create apps/web/app/new/lib/call-created-log.ts (pure module — no 'use client', no
       React; mirrors the testability pattern of app/new/lib/preflight-body.ts):
       - extractCallIdFromLogs(logs, callRegistryAddress) → bigint | null. Type logs
         structurally (readonly array of { address, data, topics } hex-typed) so both viem
         Log and raw receipt logs fit. For each log: skip unless
         log.address.toLowerCase() === callRegistryAddress.toLowerCase(); inside a per-log
         try/catch call viem decodeEventLog({ abi: callRegistryAbi, data, topics }) and if
         eventName === 'CallCreated' return args.id as bigint; on decode failure continue.
         Return null if no match. Import callRegistryAbi from '@/lib/abis'.
       - extractRevertErrorName(err: unknown) → string | null: if err is a viem BaseError,
         err.walk((e) => e instanceof ContractFunctionRevertedError) and return
         revertError.data?.errorName ?? null; otherwise null. (BaseError +
         ContractFunctionRevertedError imported from 'viem'.)
       - isUserRejection(err: unknown) → boolean: true when the BaseError walk finds a viem
         UserRejectedRequestError.
    3. Write apps/web/tests/call-created-log.test.ts covering the behavior block (D-15: real
       decode against the real ABI). RED first: write tests, watch them fail (module
       missing), implement, then green.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/web exec vitest run tests/call-created-log.test.ts</automated>
  </verify>
  <done>erc20Abi exported from @/lib/abis; the three pure helpers exist; all 5+ unit tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite usePublishCall step 3 — gas guard → approve → createCall → receipt redirect</name>
  <files>apps/web/app/new/hooks/usePublishCall.ts</files>
  <action>
    Keep steps 0-1 EXACTLY as-is (buildPreflightBody → postPreflight → effectiveConviction =
    preflight.suggestedConviction; the entire 422/RelayerError catch handling incl.
    HIDDEN_ERROR_FIELDS toast logic stays). Replace "Step 2: Build calldata" through "Step 4"
    with the direct-EOA flow:

    1. IMPORTS: remove createAaClient (@/lib/aa-config), useCirclePaymaster
       (@/hooks/useCirclePaymaster), and encodeFunctionData (writeContract takes
       abi/functionName/args directly). Add: getBalance, readContract, writeContract,
       waitForTransactionReceipt from 'wagmi/actions' (NOT @wagmi/core — context fact 1);
       wagmiConfig from '@/lib/wagmi'; ACTIVE_CHAIN_ID, USDC_ADDRESS, CALL_REGISTRY_ADDRESS
       from '@/lib/chain'; CREATION_FEE from '@call-it/shared'; erc20Abi from '@/lib/abis';
       extractCallIdFromLogs, extractRevertErrorName, isUserRejection from
       '../lib/call-created-log'. Drop the useCirclePaymaster() hook call and remove
       buildPaymasterAndData/isCircleConfigured from the useCallback dependency array.
       keccak256/toBytes (criteriaHash) stay.
    2. STATE: extend PublishState['step'] union with 'approving':
       'idle' | 'preflight' | 'approving' | 'signing' | 'waiting' | 'success' | 'error'.
       PublishResult unchanged.
    3. GAS GUARD (first thing after preflight 200, before ANY tx):
       getBalance(wagmiConfig, { address, chainId: ACTIVE_CHAIN_ID }); if .value is below a
       named const GAS_FLOOR_WEI = 10_000_000_000_000n (0.00001 ETH, commented) → error
       state + toast EXACTLY: "This wallet has no Sepolia ETH for gas — get a free drip from
       a faucet (e.g. the Alchemy Arbitrum Sepolia faucet), then retry." and return
       { status: 'error' }. No transaction attempted.
    4. ALLOWANCE/APPROVE: readContract(wagmiConfig, { address: USDC_ADDRESS, abi: erc20Abi,
       functionName: 'allowance', args: [address, CALL_REGISTRY_ADDRESS],
       chainId: ACTIVE_CHAIN_ID }). required = input.stake + CREATION_FEE (both bigint).
       If allowance < required: set step 'approving', writeContract(wagmiConfig,
       { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve',
       args: [CALL_REGISTRY_ADDRESS, required], chainId: ACTIVE_CHAIN_ID }) →
       waitForTransactionReceipt(wagmiConfig, { hash, chainId: ACTIVE_CHAIN_ID }); if
       receipt.status !== 'success' throw Error('USDC approval transaction reverted
       on-chain'). If allowance covers, skip straight to create.
    5. CREATE: set step 'signing'; compute criteriaHash exactly as today;
       writeContract(wagmiConfig, { address: CALL_REGISTRY_ADDRESS, abi: callRegistryAbi,
       functionName: 'createCall', args: [...], chainId: ACTIVE_CHAIN_ID }) with the SAME
       12 args in the SAME order currently passed to encodeFunctionData (MARKET_TYPE_TO_UINT,
       EVENT_SUBTYPE_TO_UINT with 'none' fallback, CATEGORY_TO_UINT, built.assetAUint,
       built.assetBUint — the quick-260611-bf2 dup-hash consistency invariant — targetValue,
       expiry, stake, effectiveConviction, criteriaHash, openToChallenges,
       parentCallId ?? 0n). Then set step 'waiting' with txHash = the returned tx hash;
       waitForTransactionReceipt(wagmiConfig, { hash, chainId: ACTIVE_CHAIN_ID }); if
       status !== 'success' throw Error('Transaction reverted on-chain').
    6. SUCCESS + REDIRECT: callId = extractCallIdFromLogs(receipt.logs,
       CALL_REGISTRY_ADDRESS). Set step 'success'; keep the existing success toast
       ('Call published successfully!'). If callId non-null → router.push(`/call/${callId}`)
       — the receipt page IS the product moment. If null (defensive; should not happen on a
       success receipt) → fall back to today's router.push(`/profile/${address}`) so a
       succeeded tx never dead-ends. Return { status: 'success' }. Do NOT touch page.tsx
       quote-mode logic (context fact 8).
    7. ERROR HONESTY (extend the existing catch; the 422 path stays): before the generic
       err.message fallback — (a) if isUserRejection(err) → message 'Signature request
       rejected — nothing was sent.'; (b) else if extractRevertErrorName(err) returns a name
       → map AssetNotAllowlisted to "This asset isn't allowlisted on this deployment yet."
       and any other name to `Transaction reverted: ${errorName}` (DuplicateCall,
       TvlCapReached etc. decode at gas-estimation time because the custom errors are in
       callRegistryAbi). Error state + toast in every branch; never a silent stall.
    8. REMOVE the entire sponsorship-cap-exceeded / Circle handoff branch (it referenced AA
       sponsorship that never existed on this path). apps/web/lib/aa-config.ts ITSELF stays
       UNTOUCHED — it remains the future-AA roadmap doc. Update the hook's header JSDoc:
       flow is now preflight → gas guard → allowance/approve → createCall → receipt
       redirect; note 'direct EOA until the AA client lands (quick-260611-co5 — the AA stub
       at lib/aa-config.ts was never wired; verified live 2026-06-11)'.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/web build && grep -v '^\s*\*\|^\s*//' apps/web/app/new/hooks/usePublishCall.ts | grep -c "createAaClient\|sendUserOperation\|sponsorship-cap-exceeded" | grep -qx 0 && grep -q "wagmi/actions" apps/web/app/new/hooks/usePublishCall.ts && grep -q "chainId: ACTIVE_CHAIN_ID" apps/web/app/new/hooks/usePublishCall.ts && echo PASS</automated>
  </verify>
  <done>Next build green; usePublishCall has zero non-comment references to createAaClient/sendUserOperation/sponsorship-cap; all wagmi actions pass chainId: ACTIVE_CHAIN_ID and chain-correct addresses from @/lib/chain; success path redirects to /call/{callId}.</done>
</task>

<task type="auto">
  <name>Task 3: 'approving' step in PublishConfirmModal + update the two stale Tier-1 static assertions</name>
  <files>apps/web/app/new/components/PublishConfirmModal.tsx, apps/web/tests/new-call-publish.spec.ts</files>
  <action>
    1. PublishConfirmModal.tsx: add 'approving' to the isSigning gate on line 51 (so the
       spinner view shows during approval), and add a copy line in the step→copy block
       (lines 206-209): publishStep === 'approving' → 'Approving USDC spend…'. Keep the
       existing three lines and ordering coherent (preflight → approving → signing →
       waiting). No other modal changes (the FINAL · CONFIRM review step, fee disclosure,
       and permanence copy stay byte-identical).
    2. tests/new-call-publish.spec.ts (Playwright Tier-1 static assertions — context fact 6):
       - Rewrite the D-28 ordering test (lines 111-119): marker for submission becomes
         'writeContract' (the createCall write). Assert source.indexOf('postPreflight') > -1,
         source.indexOf('writeContract') > -1, and preflight index < writeContract index.
         Rename the test title to "usePublishCall calls postPreflight before writeContract
         (D-28)" and update the header-comment bullet on line 13 to match.
       - Replace the sponsorship-cap test (lines 121-125) with a direct-EOA path test:
         assert the source contains 'getBalance' (gas guard), 'allowance' and 'approve'
         (USDC approval path), 'extractCallIdFromLogs' (receipt → callId), and does NOT
         contain 'sendUserOperation'. Title it "usePublishCall uses the direct-EOA path —
         gas guard + approve + createCall (quick-260611-co5)".
       - Touch nothing else in the spec file.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && grep -q "approving" apps/web/app/new/components/PublishConfirmModal.tsx && grep -q "Approving USDC" apps/web/app/new/components/PublishConfirmModal.tsx && grep -v '^\s*\*\|^\s*//' apps/web/tests/new-call-publish.spec.ts | grep -c "sendUserOperation" | grep -qx 1 && pnpm --filter @call-it/web exec playwright test tests/new-call-publish.spec.ts 2>&1 | tail -5</automated>
  </verify>
  <done>Modal renders progress copy for all four in-flight steps; the two updated Tier-1 static tests pass (they are readFileSync-only — no browser/server needed; if the playwright runner is unavailable in this environment, the grep gates above are the floor and the suite runs in CI). The remaining non-comment 'sendUserOperation' occurrence is the new test's negative assertion string itself.</done>
</task>

<task type="auto">
  <name>Task 4: Full verification + scope guard + single atomic commit + SUMMARY</name>
  <files>.planning/quick/260611-co5-composer-publish-direct-wagmi-writes/SUMMARY.md</files>
  <action>
    1. Full gates: `pnpm --filter @call-it/web exec vitest run` (ALL tests green — the 22
       pre-existing files + the new call-created-log.test.ts) and
       `pnpm --filter @call-it/web build` (green).
    2. Scope guard: `git status --porcelain` must show modifications ONLY under apps/web/
       (plus the untracked .planning/quick/260611-co5-* dir). Assert apps/relayer/,
       packages/ (shared/contracts/ui), and the pre-existing dirty files (context fact 9)
       are untouched by this work.
    3. Stage by EXPLICIT file list ONLY — never `git add -A` / `git add .`:
       apps/web/lib/abis/erc20.ts, apps/web/lib/abis/index.ts,
       apps/web/app/new/lib/call-created-log.ts, apps/web/app/new/hooks/usePublishCall.ts,
       apps/web/app/new/components/PublishConfirmModal.tsx,
       apps/web/tests/call-created-log.test.ts, apps/web/tests/new-call-publish.spec.ts.
       NEVER stage: packages/contracts/lib/openzeppelin-contracts (submodule),
       'call it frontend/', docs/, evidence/, .planning/, .gitignore, apps/web/.gitignore,
       .claude/launch.json, apps/relayer/src/scripts/soak-*.sh,
       apps/web/tests/visual-smoke.spec.ts-snapshots/.
    4. Commit EXACTLY: `fix(quick-260611-co5): composer publish via direct wagmi writes —
       approve+createCall with gas guard (AA stub was never wired)` (single line, single
       atomic commit on master). Verify with `git show --stat HEAD` that only the 7 files
       above are in it. Do NOT push — live verification post-push is the orchestrator's job.
    5. Write SUMMARY.md to the task dir (what changed per file, the verified root cause,
       the wagmi/actions-not-@wagmi/core decision, test results, and the live-verification
       handoff note: needs Sepolia ETH dripped to the session wallet before a real publish
       can be exercised). LEAVE SUMMARY.md UNCOMMITTED (.planning is never staged here).
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/web exec vitest run 2>&1 | tail -5 && pnpm --filter @call-it/web build >/dev/null 2>&1 && echo BUILD-OK && git show --stat HEAD | head -20 && git status --porcelain | grep -E "^(M|A|D)" | grep -v "apps/web" | wc -l</automated>
  </verify>
  <done>vitest fully green; build green; exactly one new commit on master containing ONLY the 7 apps/web files with the exact commit message; no non-apps/web tracked file modified by this work; SUMMARY.md exists in the task dir and is uncommitted.</done>
</task>

</tasks>

<verification>
1. `pnpm --filter @call-it/web exec vitest run` — all green (22 pre-existing files + new call-created-log.test.ts; zero failures).
2. `pnpm --filter @call-it/web build` — green (proves the wagmi/actions imports + removed AA imports compile under Next 16 webpack).
3. Static gates (comment-filtered): usePublishCall.ts has zero non-comment references to createAaClient / sendUserOperation / sponsorship-cap-exceeded; contains 'wagmi/actions', 'chainId: ACTIVE_CHAIN_ID', 'getBalance', 'allowance', 'extractCallIdFromLogs', and the faucet toast string.
4. `apps/web/lib/aa-config.ts` is byte-identical to HEAD~1 (`git diff HEAD -- apps/web/lib/aa-config.ts` empty before commit) — it stays as the future-AA roadmap doc.
5. Scope: `git show --stat HEAD` lists exactly the 7 apps/web files; `git status --porcelain` shows no new modifications outside apps/web + the task dir.
6. Live verification post-push (orchestrator, NOT this executor): drip Sepolia ETH to 0x73047a882e0B88a1913A25bBe8d871aBad2c5CeD, publish a call on the deployed app, confirm approve+createCall land on sepolia.arbiscan.io and the app redirects to /call/{newId}.
</verification>

<success_criteria>
- The composer's publish path contains no dead AA stub: preflight (unchanged) → gas guard → USDC approve when allowance short → CallRegistry.createCall → receipt redirect to /call/{callId}.
- Zero-ETH wallets are stopped BEFORE any tx with the exact faucet-direction toast.
- Revert errorNames surface (AssetNotAllowlisted humanized); user rejections surface; no silent stall path exists.
- All web vitest tests green, Next build green, the two Tier-1 Playwright static assertions updated to the direct-EOA reality.
- Single atomic commit `fix(quick-260611-co5): composer publish via direct wagmi writes — approve+createCall with gas guard (AA stub was never wired)` touching ONLY the 7 listed apps/web files; unrelated dirty files and the openzeppelin-contracts submodule untouched and unstaged.
</success_criteria>

<output>
Write `.planning/quick/260611-co5-composer-publish-direct-wagmi-writes/SUMMARY.md` when done (uncommitted).
</output>
