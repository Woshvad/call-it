---
phase: quick-260611-obx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/call/[id]/page.tsx
  - apps/web/tests/live-call-share.test.ts
autonomous: true
requirements: [SHARE-15, SHARE-18]

must_haves:
  truths:
    - "A user viewing their own (or anyone's) LIVE unsettled call on /call/{id} can share it to X via a web intent and to Farcaster via a compose intent (D-09 live extension — share is no longer settled-only)"
    - "The live share text NEVER contains a win/outcome word — genuinely live calls share as 'LIVE CALL', expired-unsettled calls share as 'ON RECORD' (D-08 honesty rule / 08-05 GAP 1: 'CALLED IT' is unreachable in the live path)"
    - "Share controls are OMITTED entirely (never rendered dead) when NEXT_PUBLIC_OG_BASE_URL is unset — same D-08 no-dead-controls rule as the settled action row"
    - "Existing web suite stays green with zero weakened assertions (D-15); the settled-receipt share path is byte-for-byte untouched"
  artifacts:
    - path: "apps/web/app/call/[id]/page.tsx"
      provides: "Live-view share intent derivation (liveShareHead/liveShareText/liveShareOnXUrl/liveShareCastUrl) + action anchors in the live header spread row"
      contains: "SHARE THIS CALL"
    - path: "apps/web/tests/live-call-share.test.ts"
      provides: "Vitest source-assertion spec pinning the live share wiring + the no-win-word honesty rule"
      contains: "LIVE CALL"
  key_links:
    - from: "apps/web/app/call/[id]/page.tsx (live view)"
      to: "@call-it/shared share-text builders"
      via: "twitterIntentUrl / warpcastComposeUrl / buildShareText (imports already present at line 94)"
      pattern: "liveShare(OnX|Cast)Url"
    - from: "shared /call/{id} link"
      to: "OG Live card (Phase 7)"
      via: "NEXT_PUBLIC_OG_BASE_URL-prefixed receipt URL unfurls as an honest LIVE card for unsettled calls"
      pattern: "NEXT_PUBLIC_OG_BASE_URL"
---

<objective>
Add share controls for LIVE (unsettled) calls on the call page. Live UAT (2026-06-11) found that a user who just made a call lands on /call/{id} (usePublishCall redirect, apps/web/app/new/hooks/usePublishCall.ts:276) with zero share affordance — share intents exist ONLY in the settled-receipt view (page.tsx ~1861-1882 derivation, ~2021-2068 markup). The 09.2 cut comment at ~2520-2525 documents why ("no live-call share wiring exists") — this task wires it, honestly.

Purpose: a just-published call is the moment of maximum share intent; the OG route already serves a Live card variant (Phase 7), so a shared /call/{id} link unfurls into an honest LIVE card. (SHARE-15 X intent, SHARE-18 Farcaster cast, D-09 share wiring, D-08 honesty + no-dead-controls.)

Output: one modified file (apps/web/app/call/[id]/page.tsx) + one new vitest source-assertion spec (apps/web/tests/live-call-share.test.ts), single atomic commit, no push.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/app/call/[id]/page.tsx
@packages/shared/src/share/share-text.ts
@apps/web/tests/presentation-sweep.test.ts
@apps/web/vitest.config.ts

VERIFIED FACTS (root cause already diagnosed — do not re-explore):
- Imports already present at page.tsx line 94: warpcastComposeUrl, twitterIntentUrl, buildShareText from '@call-it/shared'. No new imports needed.
- Settled share derivation (lines ~1861-1882): ogBaseForFrame = process.env.NEXT_PUBLIC_OG_BASE_URL?.replace trailing slash; receiptShareUrl = ogBaseForFrame + '/call/' + callIdNum or null; shareOnXUrl/shareAsFrameUrl via the pure builders, gated on outcomeWordResult && receiptShareUrl && callData?.handle.
- Settled action row markup (lines ~2021-2068): column div with data-receipt-action-row, gap 12, width 100% when isMobile, alignItems stretch (mobile) / flex-end (desktop); primary anchor className "btn cream" label "SHARE THE RECEIPT →" (X intent); demoted anchor className "mono receipt-frame-link" label "or share as a Farcaster frame ↗" (cast intent), fontSize 11.5, color var(--text-secondary), minHeight 44, inline-flex centered; BOTH anchors target="_blank" rel="noopener noreferrer" (reverse-tabnabbing guard T-h44-01).
- Live view in-scope variables (computed at ~1791-1800, BEFORE the settled branch at 1822, so in scope for both views): displayHandle = callerProfile?.handle ?? callData?.handle ?? '#'+callIdNum (line 1794 — IDENTICAL derivation to the settled path's handle at line 1825); displayMarketLine = callData?.marketLine || 'Open Call' (line 1796 — identical to settled marketLine). isCallExpired (line 1371), isAwaitingSettlement = callData?.status === 'live' && isCallExpired (line 1379), isMobile, callIdNum all in scope. REUSE these — no new fetches, no new derivations of handle/statement.
- buildShareText's internal isRealHandle() already omits the @segment for '#N' fallbacks, 0x addresses, and numeric pseudo-handles — pass displayHandle RAW, never pre-filter (quick-260611-5mh C3 / WR-06).
- The live render path is reached for: status 'live' (genuinely live OR expired-awaiting-settlement) AND status 'callerExited' WITHOUT an outcome (the settled branch gates on isSettled || (isCallerExited && callData?.outcome), line 1822). The head-word derivation must be total over all three states with NO win word reachable.
- Stale cut comment at ~2520-2525 ("…its unwired Share twin (no live-call share wiring exists) is cut with it — settled receipts carry the real share intents (D-09).") must be rewritten.
- Live header identity row: the spread div at ~2526; right-side pills row at ~2544 (div className "row", gap 8, flexWrap wrap) holding LIVE / AWAITING SETTLEMENT / VERIFIED CRITERIA pills.
- TEST RUNNER GOTCHA: apps/web/tests/quote-composer.spec.ts is a PLAYWRIGHT spec (.spec.ts, @playwright/test) and does NOT run under the verification command. The vitest suite includes only tests/**/*.test.ts (vitest.config.ts line 13). The new spec MUST be a .test.ts vitest file mirroring tests/presentation-sweep.test.ts (node env, readFileSync(join(process.cwd(), ...)) source assertions — same style, correct runner).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire live-call share intents + action anchors in the live view of page.tsx</name>
  <files>apps/web/app/call/[id]/page.tsx</files>
  <action>
    All changes inside the LIVE (non-settled) render scope of apps/web/app/call/[id]/page.tsx. The settled view (the if-branch at ~1822 through its return) is UNTOUCHED — do not refactor its derivation into shared consts.

    1. Derivation — place just above the live return (~2467), after the existing display* consts are in scope:
       - ogBaseLive: same expression shape as the settled ogBaseForFrame — read process.env.NEXT_PUBLIC_OG_BASE_URL, optional-chain replace of the trailing slash (regex slash-dollar). Keep it a separate const local to the live scope (do NOT hoist a shared const above the settled branch — settled stays byte-identical).
       - liveCallShareUrl: ogBaseLive present → template string of ogBaseLive + '/call/' + callIdNum; otherwise null.
       - liveShareHead — HONESTY RULE (D-08 / 08-05 GAP 1; cite both in the comment): ternary on (callData?.status === 'live' && !isCallExpired) → the string 'LIVE CALL'; else → 'ON RECORD'. The else arm intentionally also covers isAwaitingSettlement AND the callerExited-without-outcome state that falls through to this render path — 'ON RECORD' is honest for both (the call is on record and still settles at expiry). NO win word ('CALLED IT', 'CONTRARIAN HIT', 'COLD CALL', 'FADED CORRECTLY') may appear anywhere in this derivation, including comments inside the derivation block (Task 2's spec scans the block for 'CALLED IT').
       - liveShareText: buildShareText({ outcomeWord: liveShareHead, handle: displayHandle, statement: displayMarketLine }) — displayHandle passed RAW (isRealHandle inside the builder omits '#N'/0x/numeric fakes per WR-06); mirrors how the settled path passes its identically-derived handle + marketLine.
       - liveShareOnXUrl: liveCallShareUrl ? twitterIntentUrl(liveCallShareUrl, liveShareText) : null.
       - liveShareCastUrl: liveCallShareUrl ? warpcastComposeUrl(liveCallShareUrl, liveShareText) : null.
       Gate ONLY on liveCallShareUrl (no outcomeWordResult — there is none live; no handle gate — the builder self-handles fake handles). Null URL → the anchors are OMITTED entirely, never rendered dead (same D-08 rule as the settled row).

    2. Markup — inside the live header spread div at ~2526, add a share action column as a sibling AFTER the pills row div (~2544-2568), rendered only when liveShareOnXUrl or liveShareCastUrl is non-null. Mirror the settled data-receipt-action-row pattern EXACTLY:
       - Wrapper: div with data-live-share-row attribute, style display flex, flexDirection column, gap 12, width '100%' when isMobile else undefined, alignItems 'stretch' when isMobile else 'flex-end'. The parent spread already has flexWrap wrap + gap 14, so the column wraps below the identity block on narrow viewports.
       - Primary anchor (when liveShareOnXUrl): href liveShareOnXUrl, target="_blank", rel="noopener noreferrer", className "btn cream", style width '100%' when isMobile else undefined + textDecoration 'none', label exactly: SHARE THIS CALL →
       - Demoted anchor (when liveShareCastUrl): href liveShareCastUrl, target="_blank", rel="noopener noreferrer" (T-h44-01 reverse-tabnabbing guard — keep rel), className "mono receipt-frame-link", style fontSize 11.5, color var(--text-secondary), textDecoration 'none', minHeight 44, display 'inline-flex', alignItems 'center', width '100%' when isMobile else undefined, label exactly: or share as a Farcaster frame ↗
       Controls render in BOTH the genuinely-live and awaiting-settlement states (and the callerExited fall-through) — gating is only on the URL.

    3. Comment rewrite — replace the stale cut-rationale comment at ~2520-2525. Keep the AUTH-44/D-07 header-stats and eye-icon-cut sentences; REPLACE the share-twin clause ("its unwired Share twin (no live-call share wiring exists) is cut with it — settled receipts carry the real share intents (D-09)") with new text documenting: live share is now WIRED (quick-260611-obx) via the same shared pure builders as the settled row (D-09); head word is honest — 'LIVE CALL' while genuinely live, 'ON RECORD' once expired/exited-unsettled, win words unreachable (D-08 / 08-05 GAP 1); controls omitted entirely when NEXT_PUBLIC_OG_BASE_URL is unset (no dead controls, D-08). The literal phrase "no live-call share wiring exists" must no longer appear anywhere in the file (Task 2 asserts its absence).
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Build exits 0. Live view derives liveShareOnXUrl/liveShareCastUrl via the shared builders gated only on the OG base URL; "SHARE THIS CALL →" cream anchor + demoted Farcaster mono link render in the live header spread for live AND awaiting-settlement states; 'CALLED IT' unreachable in the live derivation; stale comment rewritten; settled view diff-clean.</done>
</task>

<task type="auto">
  <name>Task 2: Source-assertion vitest spec pinning the live share wiring, then atomic commit</name>
  <files>apps/web/tests/live-call-share.test.ts</files>
  <action>
    1. Create apps/web/tests/live-call-share.test.ts as a VITEST spec (NOT Playwright — quote-composer.spec.ts is @playwright/test and never runs under the verification command; vitest.config.ts includes only tests/**/*.test.ts). Mirror tests/presentation-sweep.test.ts exactly: import describe/it/expect from 'vitest', readFileSync/join from node builtins, read helper readFileSync(join(process.cwd(), 'app', 'call', '[id]', 'page.tsx'), 'utf-8'). Header comment: quick-260611-obx — live UAT 2026-06-11, live-call share was settled-only; pins D-08 honesty + D-09 wiring + D-15 (additive spec, no existing test touched).

    2. Assertions (cheap source-string checks, no DOM, no mocks):
       a. Live path builds both intents: source contains 'liveShareOnXUrl' and 'liveShareCastUrl'; the slice of source from indexOf('liveShareHead') to indexOf('data-live-share-row') contains 'twitterIntentUrl(' and 'warpcastComposeUrl(' and 'buildShareText(' (proves the LIVE block, not just the settled block, calls the builders).
       b. Honest heads present: source contains the strings 'LIVE CALL' and 'ON RECORD'.
       c. HONESTY RULE — no win word in the live derivation: take the slice between indexOf('liveShareHead') and indexOf('liveShareCastUrl') (both asserted > -1 first) and expect it NOT to contain 'CALLED IT' (also assert not 'CONTRARIAN HIT'). This pins 08-05 GAP 1 for the live path: a win word can never enter the live share text.
       d. No-dead-controls + markup contract: source contains 'data-live-share-row', 'SHARE THIS CALL' and the slice from indexOf('data-live-share-row') onward (bounded — e.g. 4000 chars) contains 'rel="noopener noreferrer"' and 'target="_blank"'.
       e. Stale rationale gone: source does NOT contain 'no live-call share wiring exists'.
       D-15: purely additive — do NOT edit, weaken, or delete any existing test file.

    3. Run the full web vitest suite and confirm all green (existing suite must not regress).

    4. Single atomic commit. Stage ONLY two paths: "apps/web/app/call/[id]/page.tsx" and apps/web/tests/live-call-share.test.ts (use git add with explicit quoted paths — the [id] brackets are glob chars in bash; quote them). NEVER stage: packages/contracts/lib/openzeppelin-contracts, 'call it frontend/', docs/, evidence/, .claude/, .planning/config.json, any .gitignore, apps/relayer/src/scripts/soak-*.sh, visual-smoke snapshots. Verify with git status --short that only the two intended files are staged before committing. Commit message exactly: fix(quick-260611-obx): live-call share controls on call page (X intent + Farcaster cast) — was settled-only
       Do NOT push.
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>vitest run fully green including the new live-call-share.test.ts (assertions a-e); no existing test modified; exactly one commit on master containing exactly the two files; nothing pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user-controlled call statement/handle → share intent URLs | untrusted strings enter twitter/farcaster intent query params |
| call page → external share targets (twitter.com, farcaster.xyz) | new window navigation from anchors |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-obx-01 | Tampering | liveShareText URL params | mitigate | reuse the pure @call-it/shared builders only — both encodeURIComponent every arg (T-07-01-02 purity contract); no hand-built intent URLs |
| T-obx-02 | Spoofing | share text @segment | mitigate | pass displayHandle raw to buildShareText; internal isRealHandle omits 0x/'#N'/numeric fakes (WR-06) — never tags a fake account |
| T-obx-03 | Tampering | target="_blank" anchors | mitigate | rel="noopener noreferrer" on both anchors (reverse-tabnabbing guard, same as T-h44-01) — pinned by spec assertion d |
| T-obx-04 | Repudiation | unsettled call shared as a win | mitigate | liveShareHead ternary makes win words unreachable in the live path (D-08 / 08-05 GAP 1) — pinned by spec assertion c |
| T-obx-SC | Tampering | npm installs | accept | zero new dependencies — imports already present at page.tsx line 94 |
</threat_model>

<verification>
- pnpm --filter @call-it/web build → exit 0
- pnpm --filter @call-it/web exec vitest run → all green (existing suite + new live-call-share.test.ts)
- git show --stat HEAD lists exactly apps/web/app/call/[id]/page.tsx + apps/web/tests/live-call-share.test.ts
</verification>

<success_criteria>
- LIVE and AWAITING SETTLEMENT call pages render "SHARE THIS CALL →" (X intent) + "or share as a Farcaster frame ↗" (cast intent) in the live header, full-width on mobile, omitted entirely when NEXT_PUBLIC_OG_BASE_URL is unset
- Live share text head is 'LIVE CALL' (genuinely live) or 'ON RECORD' (expired/exited-unsettled); 'CALLED IT' and all win words unreachable in the live path
- Settled receipt view byte-for-byte untouched; existing test suite unweakened (D-15)
- One atomic commit, two files, no push
</success_criteria>

<output>
Create `.planning/quick/260611-obx-live-call-share/SUMMARY.md` when done
</output>
