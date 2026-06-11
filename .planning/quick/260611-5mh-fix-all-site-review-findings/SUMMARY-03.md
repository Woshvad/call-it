---
id: quick-260611-5mh-03
phase: quick-260611-5mh
plan: 03
status: complete
commit: 07f39d4
completed: 2026-06-11
tasks: 5/5
suites:
  shared: 133/133 passed (7 files; +9 new share-text handle-guard tests)
  ui: 81/81 passed (9 files; +9 new avatar-initial + CallCard-state tests)
  web: 148/148 passed (17 files; +24 new status-normalization + presentation-sweep tests)
  visual: visual-smoke 4/4 passed on win32 (1 baseline honestly regenerated — see below)
builds: shared + ui + web all green (next build exit 0, /duels route emitted)
---

# Quick 260611-5mh Plan 03 Summary

**One-liner:** Web presentation truthfulness sweep — TitleCase→lowercase status normalization at the relayer-client boundary (settled-in-LIVE-tab bug), amber AWAITING SETTLEMENT state, real marketLine titles + share-text handle guards, receipt fixes (1e8 targets, criteria sentinel, bounded provenance fetch with visible error/retry + body-portaled modals), positions wiring, duel polish + NEW /duels index + branded 404, leaderboard multi-key sort + honest counts, search SOON de-emphasis, shared avatarInitial + address-casing fixes, profile call history + per-wallet social-link state, OG stake-based loss P&L (−$5.00, not −$998,306.55) with MISSED BY secondary + request-host footer, .brand nowrap.

## Commit

ONE atomic commit on master: `07f39d4` — `fix(quick-260611-5mh): web presentation sweep — status states, titles, duels, profile history, OG money semantics` (29 files, +1647/−195, no deletions). Submodule `packages/contracts/lib/openzeppelin-contracts` NOT staged; no .planning/docs/evidence/.claude/.gitignore/soak-script files touched. D-04 verified: og-fonts.ts + font files untouched. D-27 verified: no subgraph URLs added to client code (the /duels page reads the relayer only).

## C4 DEAD-BUTTON ROOT CAUSE (required content)

**The "silent fetch failure of /api/settle/:id" hypothesis is DISPROVEN.** Live probes during execution: `GET https://call-it-relayer-sepolia.fly.dev/api/settle/14` → HTTP 200 in 0.87s (fallback provenance: `txHash:""`, `settledAt:null`, `rawOracleData:null`, `relayerSignature:""`), and `/api/calls/14/live-state` → 200 fast. Code review found the handlers correctly wired and no covering overlay (`.bracketed` brackets carry `pointer-events:none`; modals are `position:fixed; z-index:200` above all chrome at z-50/60; `MiniAppReady` renders null; `MobileDrawer` returns null when closed; no transformed ancestor creates a fixed-position containing block in the current tree).

**What was actually wrong — a compound failure-mode that presents as "dead" in live use, all fixed:**
1. **Unbounded provenance fetch** — `fetchProvenanceData` had NO timeout. This exact relayer deployment has a documented stall failure-mode (profile route hung >60s; Upstash quota exhaustion stalls Redis-first routes — `settle.ts` awaits `redis.get()` before responding). A stalled request left the modal stuck on "Loading provenance data…" indefinitely with zero feedback. → Now `AbortSignal.timeout(8_000)`.
2. **No error state anywhere** — a failed/null fetch rendered silent em-dashes; with the LIVE fallback provenance (what production returns for call #14 TODAY: empty txHash/signature/raw data) the modal showed essentially nothing, indistinguishable from broken. → `fetchProvenanceData` now returns `{ok}|{error}`; ProvenanceModal renders a `role="alert"` inline error + RETRY button wired to refetch.
3. **No click feedback + ~10px hit target** — "view oracle proof" was a 10.5px zero-padding text button. → `minHeight:44` inline-flex target, `aria-busy`, and a "loading proof…" label while fetching.
4. **Hardening against the "modal mount/z-index" class** — both DisputeModal and ProvenanceModal are now rendered via `createPortal(document.body)` (SSR-gated), so no future page ancestor with transform/filter/backdrop-filter can ever trap or clip the fixed overlay.
5. **Environment trap that can reproduce "dead" testing locally** (also bit THIS execution, see Visual snapshots): port 3000 on the dev box is occupied by the **VEXA** app; Playwright `reuseExistingServer` + baseURL localhost:3000 silently tests the wrong product.

The dispute button itself is a pure `setState` → modal mount (no fetch); it inherits fix #4 and its modal already had inline toasts. With `settledAt` absent from the live payload (pre-PLAN-01-deploy), the dispute window check defaults to open — unchanged behavior, per plan ("wiring unchanged").

## Canonical duel-live-state path (required content)

**`GET /api/duels/:id/live-state`** — confirmed canonical per SUMMARY-01 (relayer registers exactly this; no alias). The web ALREADY called it correctly; **no path change was made**, only a comment pinning the contract in `fetchDuelLiveState`. The new `/duels` index uses `GET /api/duels` (live shape `{"duels":[],"count":0,"duelKing":null}` verified by curl).

## Visual snapshots (required content — D-15)

- **Regenerated: `apps/web/tests/visual-smoke.spec.ts-snapshots/profile-shell-chromium-win32.png` ONLY.** Honest reasons, all intentional: (a) NEW sidebar DUELS entry (C7), (b) search field dimmed with SOON tag (C10), (c) `@0x0000…0001` header no longer force-uppercased (C11), (d) the page body now renders the real profile card instead of the old error state because the PLAN-01 relayer (deployed) resolves the address server-side. Verified green post-regeneration; the other 3 visual-smoke baselines (home-feed, signin, new-call) pass UNCHANGED against the new code.
- **No assertion or `maxDiffPixelRatio` was modified anywhere** (D-15).
- design-system-snap suite self-skips (pre-existing `NEXT_PUBLIC_DEV_ROUTES=1` build-time gate — unrelated to this plan; its committed baselines untouched).
- **Environment gotcha for future runs:** the first visual run compared against the VEXA app because port 3000 was occupied and `reuseExistingServer` reused it. Correct procedure on this box: `npx next start -p 3100` + `PLAYWRIGHT_BASE_URL=http://localhost:3100`.

## What changed (by task)

### Task 1 — C1 status normalization + C3 titles/share guards
- `apps/web/lib/relayer-client.ts`: NEW `CallStatus` type + `normalizeCallStatus()` (TitleCase wire → lowercase canonical, unknown → 'live'); `getFeed` normalizes every item ONCE at the parse boundary (wire format unchanged); `FeedItem` gains optional PLAN-01 fields (`marketLine`, `statement`, `assetSymbol`, `targetValue`); `ProfileResponse` gains optional `calls: ProfileCallEntry[]`.
- `apps/web/app/page.tsx`: tab filters now actually match (settled+disputed → SETTLED tab; everything else LIVE).
- `apps/web/components/FeedList.tsx`: marketLine chain `item.marketLine → item.statement → 'Open Call'`; settled+disputed map to the SETTLED card tag.
- `packages/shared/src/share/share-text.ts`: NEW exported `isRealHandle()`; `buildShareText` omits the @segment entirely for absent/empty/0x-address/'undefined' handles (`handle` now optional). Also guards the relayer auto-post worker (same shared builder). +9 unit tests (`packages/shared/__tests__/share-text.test.ts`).
- `apps/web/app/call/[id]/page.tsx`: `fetchCallData` normalizes status + falls back handle → truncated address (never a "call #14" pseudo-handle) + marketLine → statement → ''; display fallback 'Open Call'; `document.title = "{marketLine} — Call It"`; receipt header handle+rep from `GET /api/profile/:caller` (degrade-to-hidden — the hardcoded live-state `repScore: 0` is never rendered as "0 rep").

### Task 2 — C2 AWAITING SETTLEMENT + C4 receipt fixes + C5 positions
- `packages/ui/src/compound/CallCard.tsx`: `isLive` is now deadline-aware (1s tick on live cards); expired+unsettled renders the amber `AWAITING SETTLEMENT` Tag (var(--accent-warning)) — never pulsing LIVE + "Closes in EXPIRED". +4 RTL tests.
- Call receipt header mirrors the same state (LIVE pill only while genuinely live; amber pill when expired-unsettled); B6 inert reason text already covered the CTA row.
- C4: `formatTarget1e8()` applied to FINAL/TARGET stats (1e8 canonical scale per PLAN-02; passes through non-numeric legacy strings); VERIFIED CRITERIA renders ONLY when criteriaText exists AND criteriaHash != the `0x…01` sentinel (call #14's literal hash); provenance/dispute fixes per the root-cause section.
- C5: `fetchFinalPositions` keeps the existing (already-correct) `/api/calls/:id/positions` path, hardens against non-array bodies, and maps OMITTED pnl to `null` — null-pnl entries render in a NEW neutral "FINAL POSITIONS" table (handle + side pill + stake) instead of being faked as +$0.00 WINNERS; section hidden when empty (D-07). PLAN-02 regions (chainId pins, B6 gating, FollowFadeModal userBalance) untouched — pinned by chain-pinning.test.ts staying green.

### Task 3 — C6 duel polish + C7 /duels + C8 404
- Duel page: handle fallbacks → truncated addresses; rep/accuracy/in-category stats hidden when 0 (per stat AND whole row, both sides); `duel #14` (was `duel #d/14`); `ARBITRUM SEPOLIA` (was `arbitrum`); PLAN-02's allowance chainId pin untouched.
- NEW `apps/web/app/duels/page.tsx`: relayer `GET /api/duels` (8s bound), brutal empty state "NO DUELS YET — Challenge a call to start one.", rows (truncated challenger vs caller, stakes, pot, status, TRENDING pill) linking `/duel/:id`, error+retry state.
- `Sidebar.tsx`: DUELS entry in `// TAPE` (icon reuse: 'book').
- NEW `apps/web/app/not-found.tsx`: server component (no client directive/hooks), "NO SUCH CALL ON THE TAPE." + cream btn home.

### Task 4 — C9 leaderboard + C10 search + C11 ProfileHeader + C12 profile/social
- `leaderboard-client.ts`: JS multi-key sort AFTER fetch (globalRep desc → settledCalls desc → wins desc; The Graph orderBy is single-field); rank assigned post-sort.
- `LeaderboardClient.tsx`: `honestCallCount = max(totalCalls, settledCalls)` in hero ("Calls made") + row sub-line (display-only — subgraph mappings untouched); 375px: dropped the forced 480px table min-width so #, CALLER, REP, ACC all fit — handles truncate with ellipsis instead of pushing REP/ACC off-screen.
- `AppShell.tsx`: search at 40% opacity, `cursor:not-allowed`, `tabIndex={-1}`, the ⌘K kbd → `SOON`; readOnly + aria-label KEPT.
- `ProfileHeader.tsx`: `overflowWrap: 'break-word'` (was 'anywhere' — mid-word wraps); textTransform dropped for 0x headlines ("0X7304" no longer reads as OX); initials via shared helper.
- NEW `packages/ui/src/lib/avatar-initial.ts` (`avatarInitial`, barrel-exported): one source for the initial — skips '0x', strips @/#; adopted in CallCard, ProfileHeader, call page (5 sites), duel page DuelAvatar, leaderboard, /duels.
- `ProfileClient.tsx`: RECENT CALLS renders the real PLAN-01 `calls` history (marketLine → statement → `Call #id` line, WON/LOST/SETTLED/DISPUTED/EXITED/LIVE tag, stake, date, link to /call/:id); honest empty state kept when absent/empty.
- `SocialLinkControls.tsx`: fetches the CURRENT wallet's `GET /api/profile/:address`; when Privy says linked but the wallet's profile lacks `twitterHandle`/`farcasterHandle`, shows the amber "— linked to a different wallet" indicator + "Link to this wallet" button triggering the EXISTING flows (`POST /api/social/link` for X; the SIWF QR/redirect flow for Farcaster — the old `!isFarcasterLinked` guard that would have suppressed the QR panel for relinks was lifted); profile refetched after successful link; mismatch only asserted when the profile fetch returned data (fetch failure degrades to the previous Privy-derived indicator — never claims a mismatch without evidence). The working @woshvad link flow body/headers are byte-identical.

### Task 5 — C13 OG money semantics + C14 wordmark
- `app/og/[callId]/route.ts`: CallerLost P&L = stake-based `formatStakeLossPnl` (−$5.00); price-delta demoted to a conditional "MISSED BY $X" stats cell (1e8 formatters reused; cell hidden when delta absent/0); CallerWon display unchanged (additive); footer = `NEXT_PUBLIC_BRAND_FOOTER ?? "{request host} · Be right in public."` with literal fallback `call-it-web-sepolia.vercel.app`; card title already flowed from live-state marketLine via `getMarketLine` (PLAN-01 A2) — unchanged. **D-04: zero font changes** (pinned by a new test).
- Same request-host footer fix applied to the other two stale fallbacks: `app/og/duel/[challengeId]/route.ts` ('callitapp.xyz') and `app/api/og/[callId]/route.ts` (literal '[BRAND]' placeholder) — both routes already had `url` in scope. The og-unit.test.ts fallback-route env-var invariants still pass (that route untouched).
- `globals.css`: `.brand { white-space: nowrap; }`.

## Deviations from plan

1. **[Rule 2 — coherence] `app/api/og/[callId]/route.ts` + `app/og/duel/[challengeId]/route.ts` footer fallbacks also fixed** (plan files_modified listed only `app/og/[callId]/route.ts`, but the plan action cites "~lines 65, 484, 737" which live in these three files respectively — the '[BRAND]' placeholder rendered verbatim on the api/og fallback card).
2. **[Plan-anticipated] C6 path alignment required no code change** — the web already calls the canonical `/api/duels/:id/live-state`; pinned with a comment only.
3. **[Minor] `ProfileTabs.tsx` untouched** despite being in files_modified — it is mounted NOWHERE in the app (grep: only its own file + a Playwright spec reference); the call history renders in `ProfileClient.tsx`, the page's real renderer. Modifying a dead component would have been cosmetic.
4. **[Scope note] `app/api/frame/tx/[callId]/route.ts` keeps its TitleCase `status === 'Settled'` comparison** — it is a SERVER route doing its own direct wire fetch (not a relayer-client consumer); the wire format is unchanged by design and frame-tx.test.ts pins this behavior (D-15). The verification gate ("no TitleCase comparisons against relayer-client output") passes — enforced by the new status-normalization.test.ts grep gate.
5. **[Honest fallback choice] OG CallerWon P&L left on the existing priceDelta display** — the plan mandated stake-based P&L for CallerLost only; a win's true payout needs settlement-event data this route doesn't read (Phase-7 noted TODO), so the loss-side lie was fixed without inventing a win-side number.

## Tests changed/added (D-15 — no weakened tests)

- NEW `packages/shared/__tests__/share-text.test.ts` (9): isRealHandle matrix + buildShareText for real/undefined/0x/empty handles + 240-cap retained.
- NEW `packages/ui/__tests__/avatar-initial.test.ts` (5) + `call-card-states.test.tsx` (4): AWAITING SETTLEMENT vs LIVE vs SETTLED render states; 0x-initial.
- NEW `apps/web/tests/status-normalization.test.ts` (7): normalizeCallStatus unit + grep gates (no TitleCase status comparisons in page.tsx/FeedList/call page; boundary normalization present).
- NEW `apps/web/tests/presentation-sweep.test.ts` (17): source gates for C2/C4/C6/C7/C8/C9/C10/C13/C14 (incl. D-04 font-freeze pin and the no-'callitapp.xyz'-fallback pin).
- No existing test expectations modified anywhere. Pre-existing suites all green unchanged (incl. chain-pinning, og-unit, og-real-data-wiring, frame-tx, settled-outcome-truth).

## Verification results

- Builds: shared / ui / web all green; `/duels` route emitted by next build.
- Vitest: shared 133/133, ui 81/81, web 148/148.
- Visual (win32, local): visual-smoke 4/4 passed against a clean `next start -p 3100` (port 3000 = VEXA, see gotcha above); ONLY profile-shell regenerated.
- Grep gates: no TitleCase status comparisons in relayer-client consumers (only the frame-tx server route's own-wire comparison + OG TODO comments remain); D-04 `git status` clean for og-fonts.ts/app/fonts; D-27 no subgraph URLs in client code; packages/contracts + packages/subgraph + settlement-worker Redis untouched; submodule not staged.

## Notes for the operator

- The feed-side enrichment (marketLine/assetSymbol on `/api/feed`) and profile `calls` history activate fully once the PLAN-01 relayer is DEPLOYED to Fly (live `/api/calls/14/live-state` still lacks `marketLine`/`settledAt` — the web degrades exactly as designed: 'Open Call' title, dispute window assumed open).
- The C12 "Link to this wallet" relink calls the existing `POST /api/social/link` — the relayer resolves the wallet from the Privy user server-side (Pitfall 2), so it links the Privy-resolved wallet. If that ever needs to target an arbitrary connected wallet, that is a relayer-side change (out of this plan's scope — wire format frozen).

## Self-Check: PASSED

- All new files exist on disk (duels/page.tsx, not-found.tsx, avatar-initial.ts, 4 new test files).
- Commit `07f39d4` present on master; no deletions in the commit; forbidden paths not staged (verified by `git diff --cached --name-only` grep = 0).
- Full build chain + all three vitest suites green post-commit.
