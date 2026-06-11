---
phase: quick
plan: 260611-scj
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/components/WalletPill.tsx
  - apps/web/app/components/AppShell.tsx
  - apps/web/app/globals.css
  - apps/web/tests/wallet-popover.test.ts
autonomous: true
requirements: [QUICK-260611-SCJ]
must_haves:
  truths:
    - "Clicking the header balance pill opens an anchored popover showing the viewer's OWN wallet address with a working COPY button (user request 2026-06-11)"
    - "Pill FACE still renders handle + balance only — the address NEVER renders while the popover is closed (AUTH-44 contract preserved)"
    - "Popover closes on Escape, on outside click, and on pill re-click (toggle) without insta-reopen"
    - "Popover shows profile snapshot (handle headline, verified pills, stats line) only when profile data exists (D-07 degrade) and links to /profile/{addr} and /profile/{addr}/settings"
    - "Handles render AS STORED — no uppercase transform on handle text (user decision 2026-06-11)"
  artifacts:
    - path: "apps/web/app/components/WalletPill.tsx"
      provides: "Extracted WalletPill button + anchored popover panel"
      min_lines: 80
    - path: "apps/web/app/components/AppShell.tsx"
      provides: "Imports { WalletPill } from './WalletPill'; no inline pill; C10 search block byte-stable"
    - path: "apps/web/app/globals.css"
      provides: "button.wallet-pill reset + hover after the existing div recipe"
      contains: "button.wallet-pill"
    - path: "apps/web/tests/wallet-popover.test.ts"
      provides: "Source-assertion vitest pinning extraction, copy, close handlers, hrefs, AUTH-44 gate, as-stored casing"
  key_links:
    - from: "apps/web/app/components/AppShell.tsx"
      to: "apps/web/app/components/WalletPill.tsx"
      via: "named import"
      pattern: "import \\{ WalletPill \\} from './WalletPill'"
    - from: "apps/web/app/components/WalletPill.tsx"
      to: "navigator.clipboard"
      via: "COPY button handler"
      pattern: "navigator\\.clipboard\\.writeText\\(profileAddr\\)"
    - from: "apps/web/app/components/WalletPill.tsx"
      to: "/profile/{profileAddr}"
      via: "next/link footer actions"
      pattern: "/profile/\\$\\{profileAddr\\}"
---

<objective>
Wallet pill popover: clicking the header balance pill (e.g. "5.00 USDC") opens an anchored dropdown with the viewer's own wallet address (copyable) + a small profile snapshot + VIEW PROFILE / SETTINGS quick links (user request 2026-06-11).

Purpose: standard wallet UX — the signed-in user has no fast way to grab their own address today (it only exists buried in onboarding/fund).
Output: new `WalletPill.tsx` component (extracted from AppShell), a `button.wallet-pill` CSS reset, and a source-assertion vitest file. Single atomic commit, 4 staged paths, no push.

All decisions are made (orchestrator + user, 2026-06-11) — do not re-litigate AUTH-44 nuance, handle casing, or panel chrome.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/app/components/AppShell.tsx          # WalletPill inline at lines 50-81; C10 search block 132-152 must stay byte-stable
@apps/web/app/globals.css                      # .wallet-pill div recipe lines 302-312; .icon-btn hover precedent at 314-324
@apps/web/app/components/NotificationInbox.tsx # Escape-close useEffect pattern lines 134-141; `.pill` chip usage ~84-87
@apps/web/app/onboarding/fund/page.tsx         # handleCopy pattern lines 84-93 (clipboard try/catch + COPIED 2s reset)
@apps/web/tests/presentation-sweep.test.ts     # source-assert style + read() helper line 12; C10 pin lines 125-133 must stay green
@apps/web/lib/relayer-client.ts                # ProfileResponse shape (~483-501): handle, source, globalRep, totalCalls, settledCalls, wins, verifiedX, verifiedFc
@packages/ui/src/compound/ProfileHeader.tsx    # as-stored handle casing precedent comment ~153-156; singular/plural stats ~99-101
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract WalletPill into its own file and add the anchored popover</name>
  <files>apps/web/app/components/WalletPill.tsx, apps/web/app/components/AppShell.tsx</files>
  <action>
Create NEW FILE `apps/web/app/components/WalletPill.tsx` ('use client'). Move the `WalletPill` function out of AppShell.tsx verbatim as the starting point (same hooks: usePrivy, useAccount, useUsdcBalance, useProfile; same `profileAddr` derivation, same null-until-ready gate, same 2dp `balance` toLocaleString, same AUTH-44 `source !== 'truncated'` handle rule). Export it as a named export. Move the matching imports with it; in AppShell.tsx delete the inline function + now-unused imports (useUsdcBalance, useProfile, useAccount, usePrivy — keep useState/usePathname etc. that AppShell still uses) and add `import { WalletPill } from './WalletPill';`. AppShell is OTHERWISE UNCHANGED — the C10 search block (lines 132-152, 'SOON' / readOnly / aria-label="Search (coming soon)" / cursor: 'not-allowed') stays byte-stable; presentation-sweep.test.ts pins it.

In WalletPill.tsx, upgrade the pill into a popover anchor:

1. Wrapper: `<div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex' }}>` around both the pill face and the panel.
2. Pill face becomes `<button type="button" className="wallet-pill" data-testid="wallet-pill" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>` — face CONTENT (balance span + ccy span + optional handle span) EXACTLY as today. No address on the face, ever.
3. State: `const [open, setOpen] = useState(false);` plus `copied` state and `const wrapperRef = useRef<HTMLDivElement>(null);`.
4. Close behavior — one useEffect gated on `open` (attach listeners ONLY while open, mirror NotificationInbox.tsx:135-141 for the keydown shape):
   - `document.addEventListener('keydown', ...)` → `e.key === 'Escape'` → `setOpen(false)`.
   - `document.addEventListener('mousedown', ...)` → if `wrapperRef.current && !wrapperRef.current.contains(e.target as Node)` → `setOpen(false)`. The contains check is on the WRAPPER so a pill click while open passes the contains check and only the button's toggle runs — no close-then-reopen race.
   - Cleanup removes both listeners.
5. Panel — rendered ONLY as `{open && profileAddr && ( ... )}` (the address never exists in the DOM while closed — AUTH-44 pill-face contract): `<div role="dialog" aria-label="Wallet" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, width: 300, maxWidth: 'calc(100vw - 28px)', border: '2px solid var(--border-strong)', background: 'var(--bg-secondary)', borderRadius: 0, boxShadow: '4px 4px 0 0 rgba(0,0,0,0.8)', padding: 14 }}>`.
6. Panel contents top→bottom (D-07 — render only what exists):
   a. Identity headline: when `profile` present AND `profile.source !== 'truncated'` → `@{profile.handle}` in display voice: `fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, textTransform: 'none'` (handles render AS STORED — user decision 2026-06-11; precedent comment at ProfileHeader.tsx:153-156). Beside it, inline `.pill` spans (NotificationInbox.tsx:84-87 chip recipe) reading `VERIFIED · X` when `profile.verifiedX` and `VERIFIED · FC` when `profile.verifiedFc`. When there is no real handle → the truncated address IS the headline, JBM mono (`fontFamily: 'var(--font-mono)'`).
   b. Address row (ALWAYS renders — the address is the point of this popup): JBM mono truncated `` `${profileAddr.slice(0, 6)}…${profileAddr.slice(-4)}` `` + a small bordered COPY button (JBM 10-11px, 2px border var(--border-active), bg var(--bg-tertiary) or secondary — match the chrome). onClick mirrors fund/page.tsx:84-93: `await navigator.clipboard.writeText(profileAddr)` in try/catch → `setCopied(true)` → `setTimeout(() => setCopied(false), 2000)`; label renders `copied ? 'COPIED' : 'COPY'`. Either clear the timer on unmount via a ref or mirror the fund-page pattern as-is — both acceptable.
   c. Balance row: the same 2dp `balance` string + `USDC`, slightly larger / var(--text-primary) — the primary number in the panel.
   d. Stats line (only when `profile` present): JBM mono, color var(--text-tertiary), fontSize 11, interpunct-separated: `{totalCalls} calls · {settledCalls} settled · {wins} wins` (singular/plural like ProfileHeader.tsx:99-101 if trivial; either is fine) and append ` · REP {globalRep}` only when `Number.isFinite(profile.globalRep)`.
   e. Footer actions: two stacked next/link Links, each `onClick={() => setOpen(false)}`, JBM mono small, with borderTop '1px solid var(--border-active)' separators consistent with the chrome: `VIEW PROFILE →` href={`/profile/${profileAddr}`} and `SETTINGS →` href={`/profile/${profileAddr}/settings`}.
7. File-header comment block covering: component purpose (header balance pill + click-anchored wallet popover); the AUTH-44 nuance verbatim in spirit — the pill FACE never shows an address; the popover shows the viewer's OWN address only after a deliberate click, standard wallet UX (user decision 2026-06-11); D-07 degrade — profile undefined → address + balance + links only; handle as-stored casing (no uppercase transform).
  </action>
  <verify>
    <automated>cd apps/web && pnpm exec vitest run tests/presentation-sweep.test.ts</automated>
  </verify>
  <done>WalletPill.tsx exists with button face + gated popover; AppShell.tsx imports it, has no inline pill (no useUsdcBalance reference), and the C10 search pin still passes.</done>
</task>

<task type="auto">
  <name>Task 2: globals.css button.wallet-pill reset + hover</name>
  <files>apps/web/app/globals.css</files>
  <action>
Immediately after the existing `.wallet-pill .handle` rule (line ~312, before `.icon-btn`), add — keeping the div recipe at 302-312 fully intact:

button.wallet-pill { cursor: pointer; color: inherit; font: inherit; appearance: none; }
button.wallet-pill:hover { border-color: var(--border-strong); }

This neutralizes UA button styling (the face is now a <button>) so the existing .wallet-pill recipe renders identically, and adds the same hover affordance as .icon-btn:hover (line 324).
  </action>
  <verify>
    <automated>cd apps/web && grep -c "button.wallet-pill" app/globals.css</automated>
  </verify>
  <done>globals.css contains both button.wallet-pill rules directly after the div recipe; div recipe unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: wallet-popover source-assertion test + gates + atomic commit</name>
  <files>apps/web/tests/wallet-popover.test.ts</files>
  <action>
Create NEW FILE `apps/web/tests/wallet-popover.test.ts` — source-assertion vitest in the presentation-sweep.test.ts style (D-15): node env, no DOM, `import { describe, it, expect } from 'vitest'`, `readFileSync`/`existsSync` from node:fs, and the same `const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');` helper. Assertions (substring/regex on source — robust-but-honest, never line numbers):

(i) Extraction: `app/components/WalletPill.tsx` exists; AppShell.tsx source contains `import { WalletPill } from './WalletPill'` and NOT `useUsdcBalance` (the inline pill is gone); WalletPill.tsx source contains `<button`, `aria-haspopup="dialog"`, and `aria-expanded`.
(ii) Copy: WalletPill.tsx contains `navigator.clipboard.writeText(profileAddr)`, `'COPIED'`, and `2000`.
(iii) Close handlers: WalletPill.tsx contains `'keydown'`, `'Escape'`, `'mousedown'`, and `.contains(`.
(iv) Quick links: WalletPill.tsx contains the template strings `` /profile/${profileAddr} `` and `` /profile/${profileAddr}/settings `` (match e.g. /\/profile\/\$\{profileAddr\}`/ and /\/profile\/\$\{profileAddr\}\/settings/).
(v) AUTH-44 pill-face contract: WalletPill.tsx matches /open && profileAddr &&/ and BOTH truncated-slice expressions (`profileAddr.slice(0, 6)` / `profileAddr.slice(-4)` — match flexibly on whitespace) appear AFTER the index of the `open && profileAddr &&` gate in the source (use src.indexOf comparisons, not line numbers). Also assert the gate index is AFTER the `return (` / button-face region OR simply that no slice expression appears before the gate index — keep it honest: the structural claim is "address interpolation only exists inside the gated panel block".
(vi) As-stored casing: WalletPill.tsx contains `textTransform: 'none'` and does NOT match /textTransform:\s*'uppercase'/.

Then run the gates from repo root (Git Bash):
1. `pnpm --filter @call-it/web build` → exit 0.
2. `pnpm --filter @call-it/web exec vitest run` → ALL green (baseline 249 passing; presentation-sweep C10 pin must stay green; new file adds its tests on top).

Fix any failures (test or source) until both gates pass, then commit ONE atomic commit. Stage ONLY these 4 paths, explicitly, one `git add` each — NEVER `git add -A` or `git add .` (a parallel session shares this repo with unrelated dirty files; never stage packages/contracts/lib/openzeppelin-contracts, 'call it frontend/', docs/, evidence/, .claude/, .planning/, .gitignore changes, soak scripts, or snapshots):
- apps/web/app/components/WalletPill.tsx
- apps/web/app/components/AppShell.tsx
- apps/web/app/globals.css
- apps/web/tests/wallet-popover.test.ts

Commit message: `feat(quick-260611-scj): wallet pill popover — click balance → own address (copy) + profile snapshot + quick links`

Do NOT push (orchestrator pushes).
  </action>
  <verify>
    <automated>pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>wallet-popover.test.ts passes all 6 assertion groups; full vitest suite green (≥249 + new); web build exit 0; exactly one commit with exactly the 4 staged paths; nothing pushed.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → all green, including presentation-sweep C10 pin (AppShell search block untouched) and the new wallet-popover suite
- `git show --stat HEAD` → exactly 4 files: WalletPill.tsx (new), AppShell.tsx, globals.css, wallet-popover.test.ts
- `git status` → unrelated dirty files (docs/, 'call it frontend/', evidence/, .planning/, submodule) still unstaged
</verification>

<success_criteria>
- Header pill is a button; clicking opens an anchored 300px panel (right-aligned, brutal chrome: 2px var(--border-strong), 4px 4px hard shadow, radius 0)
- Panel: identity headline (as-stored handle, Archivo 800 18px, verified pills) OR truncated-address headline; address row with COPY→COPIED(2s); balance row; stats line (D-07 gated); VIEW PROFILE / SETTINGS links that close on navigate
- Escape, outside-click, and pill re-click all close it; listeners only attached while open
- AUTH-44 preserved: face shows handle+balance only; address exists in DOM only inside `{open && profileAddr && ...}`
- Single atomic commit, 4 explicit paths, no push
</success_criteria>

<output>
Create `.planning/quick/260611-scj-wallet-pill-popover/SUMMARY.md` when done (use the summary template). Note the AUTH-44 nuance and the AppShell extraction in the summary's decisions section.
</output>
