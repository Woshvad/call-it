---
phase: quick-260611-npv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/profile/[address]/settings/page.tsx
  - apps/web/app/components/SocialLinkControls.tsx
  - apps/web/tests/chain-pinning.test.ts
autonomous: true
requirements: [AUTH-35, AUTH-12]

must_haves:
  truths:
    - "Save Handle (setDisplayHandle) targets the canonical chain-aware PROFILE_REGISTRY_ADDRESS from @/lib/chain — never an env-var-with-zero-fallback local const"
    - "Unlink Twitter and Unlink Farcaster writes target the same canonical address"
    - "'Handle saved on-chain.' only renders after an on-chain read-back confirms displayHandle(connectedAddress) equals the submitted input"
    - "Read-back mismatch surfaces 'Save confirmed but the handle did not update — contact support.' and handleSaved stays false"
    - "A regression test pins the active-chain PROFILE_REGISTRY_ADDRESS as non-zero and pins both files off the env-var pattern"
  artifacts:
    - path: "apps/web/app/profile/[address]/settings/page.tsx"
      provides: "Canonical-address setDisplayHandle write + post-receipt read-back verification"
    - path: "apps/web/app/components/SocialLinkControls.tsx"
      provides: "Canonical-address unlinkTwitter/unlinkFarcaster writes"
    - path: "apps/web/tests/chain-pinning.test.ts"
      provides: "Regression pin: non-zero active ProfileRegistry address + no env-fallback pattern in either file"
  key_links:
    - from: "apps/web/app/profile/[address]/settings/page.tsx"
      to: "apps/web/lib/chain.ts"
      via: "import { PROFILE_REGISTRY_ADDRESS } from '@/lib/chain'"
      pattern: "PROFILE_REGISTRY_ADDRESS"
    - from: "apps/web/app/components/SocialLinkControls.tsx"
      to: "apps/web/lib/chain.ts"
      via: "import { ACTIVE_CHAIN_ID, PROFILE_REGISTRY_ADDRESS } from '@/lib/chain'"
      pattern: "PROFILE_REGISTRY_ADDRESS"
    - from: "apps/web/app/profile/[address]/settings/page.tsx"
      to: "ProfileRegistry.displayHandle"
      via: "readContract from 'wagmi/actions' after waitForTransactionReceipt success"
      pattern: "functionName: 'displayHandle'"
---

<objective>
Kill the zero-address ProfileRegistry writes. VERIFIED LIVE (2026-06-11): Vercel lacks
NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS, so both `PROFILE_REGISTRY_ADDR = env ?? 0x000…000`
local consts resolved to the zero address. A tx to the zero address mines "successfully"
(no code → no revert → receipt.status 'success'), so even the m72 receipt-gated save flow
reported "Handle saved on-chain." while writing into the void — canonical ProfileRegistry
0xF66C0AFE… still has displayHandle="" (cast-verified).

Fix: both files switch to the canonical chain-aware `PROFILE_REGISTRY_ADDRESS` from
`apps/web/lib/chain.ts` (baked from @call-it/shared at build time, never zero on the active
chain), and the settings save flow gains post-receipt read-back verification so "saved" can
never again be claimed without the chain actually reflecting it.

Purpose: restore real on-chain handle saves + social unlinks; make silent-success
structurally impossible for this flow.
Output: 2 source files fixed + 1 regression-pin test block; build green; vitest green
(236 baseline + new pins).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@apps/web/app/profile/[address]/settings/page.tsx
@apps/web/app/components/SocialLinkControls.tsx
@apps/web/lib/chain.ts
@apps/web/lib/abis/ProfileRegistry.ts
@apps/web/tests/chain-pinning.test.ts
</context>

<verified_facts>
Pre-verified during planning — do NOT re-derive, just use:

- `displayHandle(user) → string` ALREADY exists in `apps/web/lib/abis/ProfileRegistry.ts`
  (view function, lines 65-71). NO ABI addition needed.
- Settings page imports `waitForTransactionReceipt` from `'wagmi/actions'` (line 31) but
  NOT `readContract` — add it to that existing import.
- Settings page already has the `ActiveChainId` cast alias (line 52:
  `type ActiveChainId = (typeof wagmiConfig)['chains'][number]['id']`) used for the
  `waitForTransactionReceipt` chainId cast — reuse it for `readContract`.
- `SocialLinkControls.tsx` already imports `ACTIVE_CHAIN_ID` from `'@/lib/chain'` (line 38)
  — extend that import with `PROFILE_REGISTRY_ADDRESS`.
- Zero-fallback consts to DELETE: settings page lines 45-48; SocialLinkControls lines 55-57.
- Write sites to repoint: settings `address:` at line ~149; SocialLinkControls `address:`
  at lines ~335 (unlinkTwitter) and ~354 (unlinkFarcaster).
- Grep confirms ONLY these 2 files reference `NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS` in
  apps/web — full removal is in scope.
- Mainnet `PROFILE_REGISTRY_ARBITRUM_ONE` in @call-it/shared is a DOCUMENTED 0x0
  placeholder until the Phase 7.5 cutover (chain.ts header, lines 19-21). The regression
  test must assert non-zero ONLY for the active (Sepolia-default) selection — asserting
  the mainnet constant non-zero would fail the suite.
- The save flow submits `args: [handleInput]` RAW (not trimmed) — read-back must compare
  against the exact submitted string.
- Vitest baseline: 236 passing (`pnpm --filter @call-it/web exec vitest run`).
</verified_facts>

<tasks>

<task type="auto">
  <name>Task 1: Repoint both ProfileRegistry write surfaces to canonical chain.ts address + add save read-back verification</name>
  <files>apps/web/app/profile/[address]/settings/page.tsx, apps/web/app/components/SocialLinkControls.tsx</files>
  <action>
**A. `apps/web/app/profile/[address]/settings/page.tsx`** (KEEP the m72 async structure —
ensureActiveChain → writeContractAsync → waitForTransactionReceipt → status branch — intact):

1. DELETE the local const block at lines 45-48 (`PROFILE_REGISTRY_ADDR = process.env… ?? '0x000…000'`)
   including its `// ProfileRegistry address from env` comment.
2. Extend the existing `@/lib/chain` import (line 37) to
   `import { ACTIVE_CHAIN_ID, PROFILE_REGISTRY_ADDRESS } from '@/lib/chain';`
3. Extend the `'wagmi/actions'` import (line 31) to
   `import { waitForTransactionReceipt, readContract } from 'wagmi/actions';`
4. In `handleSetDisplayHandle`, replace `address: PROFILE_REGISTRY_ADDR` with
   `address: PROFILE_REGISTRY_ADDRESS` at the write site (~line 149).
5. Add a short rationale comment near the write or at the top of the handler: the address
   comes from `@/lib/chain` (the repo's address authority, baked from @call-it/shared,
   never zero on the active chain) because a per-app env override that was unset in Vercel
   fell back to the zero address, and zero-address txs mine "successfully" (no code → no
   revert), producing a live silent-success failure 2026-06-11. CRITICAL: the comment must
   NOT contain the literal env-var name string (Task 2 adds a source-text regression guard
   asserting the file no longer contains it) — describe it as "a per-app env override".
6. TS-safe caller guard at function entry: after the existing empty/length validation, add
   `if (!connectedAddress) { setHandleError('No connected wallet — reconnect and retry.'); return; }`
   and capture `const caller = connectedAddress;` so the read-back closure has a narrowed
   `0x${string}`.
7. READ-BACK VERIFICATION (the core fix): in the `receipt.status === 'success'` branch,
   replace the unconditional `setHandleSaved(true)` with:
   - `const onChainHandle = await readContract(wagmiConfig, { address: PROFILE_REGISTRY_ADDRESS, chainId: ACTIVE_CHAIN_ID as ActiveChainId, abi: profileRegistryAbi, functionName: 'displayHandle', args: [caller] });`
   - If `onChainHandle === handleInput` (compare to the EXACT submitted raw string — the
     write submits `args: [handleInput]` untrimmed) → `setHandleSaved(true)`.
   - Else → `setHandleError('Save confirmed but the handle did not update — contact support.');`
     and do NOT call `setHandleSaved(true)`.
   - A throw from `readContract` falls through to the existing outer catch (honest error,
     handleSaved stays false) — no extra try/catch needed.
8. Update the file-header comment block (lines 7-10) to reflect that success is now
   receipt-gated AND read-back-verified against the canonical registry address
   (quick-260611-npv). Same rule: no literal env-var name.

**B. `apps/web/app/components/SocialLinkControls.tsx`** (unlink flows only — do NOT touch
the link flows, relayer POSTs, or C12 linked-elsewhere logic):

1. DELETE the local const at lines 55-57 (`PROFILE_REGISTRY_ADDR = process.env[…] ?? '0x000…000'`).
2. Extend the existing import (line 38) to
   `import { ACTIVE_CHAIN_ID, PROFILE_REGISTRY_ADDRESS } from '@/lib/chain';`
3. Replace `address: PROFILE_REGISTRY_ADDR` with `address: PROFILE_REGISTRY_ADDRESS` in
   BOTH `handleUnlinkTwitter` (~line 335) and `handleUnlinkFarcaster` (~line 354). Their
   surrounding `ensureActiveChain()` + try/catch error handling is already correct — leave
   it as-is. (Note: unlink writes are not receipt-gated; that is pre-existing scope and NOT
   part of this fix — only the address source changes here.)
4. One-line rationale comment at the import or first write site, same content rule as A.5
   (no literal env-var name).

NO new ABI entries — `displayHandle` already exists in `apps/web/lib/abis/ProfileRegistry.ts`.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && grep -c "NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS" "apps/web/app/profile/[address]/settings/page.tsx" apps/web/app/components/SocialLinkControls.tsx; pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Both grep counts are 0 (grep exits non-zero on no-match — that IS the pass state); zero-fallback consts gone; both write sites + the new readContract use PROFILE_REGISTRY_ADDRESS from @/lib/chain; save success only after read-back equality; mismatch shows the contact-support error without handleSaved; `pnpm --filter @call-it/web build` exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: Regression pin in chain-pinning.test.ts + full gates + single commit</name>
  <files>apps/web/tests/chain-pinning.test.ts</files>
  <action>
**Regression pin** — append a new `describe` block to `apps/web/tests/chain-pinning.test.ts`
(this file already imports `PROFILE_REGISTRY_ADDRESS` from `../lib/chain` and has the
`read(path)` source-text helper — follow its existing guard style, e.g.
`describe('ProfileRegistry writes — canonical address, no env fallback (quick-260611-npv)')`):

1. `PROFILE_REGISTRY_ADDRESS` is NOT the zero address:
   `expect(PROFILE_REGISTRY_ADDRESS).not.toBe('0x0000000000000000000000000000000000000000')`
   and equals `PROFILE_REGISTRY_ARBITRUM_SEPOLIA` (already imported in this file). Do NOT
   assert the mainnet constant is non-zero — `PROFILE_REGISTRY_ARBITRUM_ONE` is a documented
   0x0 placeholder in @call-it/shared until the Phase 7.5 cutover.
2. Source-text pins for BOTH files (`app/profile/[address]/settings/page.tsx` and
   `app/components/SocialLinkControls.tsx`), via the existing `read()` helper:
   - `not.toContain('NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS')` (the env-fallback pattern is dead)
   - `not.toContain('PROFILE_REGISTRY_ADDR =')` (the local const is gone)
   - `toContain('PROFILE_REGISTRY_ADDRESS')` and `toContain('@/lib/chain')` (canonical source wired)
3. Settings-page read-back pin: source contains `functionName: 'displayHandle'` and
   `readContract` (the save flow verifies on-chain state, not just receipt status).

**Gates** (both must pass before commit):
- `pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → all green (236 baseline + the new pins;
  zero failures)

**Commit** (single, exactly this message):
`fix(quick-260611-npv): ProfileRegistry writes use canonical chain.ts address (env-unset fell back to 0x0 — txs mined successfully into the void) + save read-back verification`

Stage ONLY these 3 files:
- `apps/web/app/profile/[address]/settings/page.tsx`
- `apps/web/app/components/SocialLinkControls.tsx`
- `apps/web/tests/chain-pinning.test.ts`

Do NOT stage anything else (worktree has unrelated dirty files: .claude/launch.json,
.gitignore, .planning/config.json, "call it frontend/", docs/, evidence/, etc.). Do NOT push.
  </action>
  <verify>
    <automated>cd "C:\Users\woshv\Desktop\Call it" && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>vitest fully green (>=236 tests, 0 failures) including the new ProfileRegistry pin block; build exit 0; exactly one commit with the specified message containing only the 3 listed files; nothing pushed.</done>
</task>

</tasks>

<verification>
- `grep -rn "NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS" apps/web` → no matches (env-fallback pattern eradicated from the web app)
- `grep -n "PROFILE_REGISTRY_ADDRESS" "apps/web/app/profile/[address]/settings/page.tsx" apps/web/app/components/SocialLinkControls.tsx` → 3 write sites + imports + 1 readContract all resolve to the chain.ts constant
- `pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → all green, includes the new regression block
- `git log -1 --stat` → single quick-260611-npv commit touching exactly 3 files
</verification>

<success_criteria>
- Zero-address fallback consts deleted from both files; every ProfileRegistry write
  (setDisplayHandle, unlinkTwitter, unlinkFarcaster) targets PROFILE_REGISTRY_ADDRESS
  from @/lib/chain
- "Handle saved on-chain." is unreachable without a read-back-confirmed displayHandle match;
  mismatch path shows 'Save confirmed but the handle did not update — contact support.'
- Regression test pins the active-chain address non-zero and both files off the env pattern
- Build + vitest gates green; single scoped commit; no push
</success_criteria>

<output>
Create `.planning/quick/260611-npv-profile-registry-canonical-addr/260611-npv-SUMMARY.md` when done.
</output>
