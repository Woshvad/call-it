---
phase: quick-260612-8wk
plan: 260612-8wk
slug: how-it-works-modal
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/components/HowItWorksModal.tsx
  - apps/web/app/page.tsx
  - apps/web/tests/how-it-works-modal.test.ts
autonomous: true
requirements: [QUICK-260612-8WK]
must_haves:
  truths:
    - "A HOW IT WORKS `btn ghost` button renders in the tape page-header LEFT of the auth-aware CTA (+ NEW CALL signed-in / Sign in signed-out), visible in BOTH auth states inside the existing flex-gap-12 right-side container, minHeight 44 (user request 2026-06-12)"
    - "Clicking it opens a Polymarket-style static explainer modal built on the D-13 cream .modal-panel template — overlay position fixed inset 0, zIndex 200, rgba(0,0,0,0.82) + backdropFilter blur(4px), flex-centered; panel var(--bg-inverse) cream, BLACK text, 3px black border, var(--shadow-brutal-lg) — chrome mirrored from ChallengeFormModal.tsx (D-13, 09.2-08)"
    - "Modal copy is the landing canon VERBATIM: '· HOW IT WORKS' overline, 'Three steps. One receipt.' heading (contiguous string, display font 900 black), the 3 numbered steps with titles GO ON RECORD / FOLLOW OR FADE / GET YOUR RECEIPT and bodies byte-identical to the apps/web/app/signin/page.tsx HOW_IT_WORKS array (duplicated locally with a copy-canon comment, NEVER cross-imported from the page module)"
    - "Compact mono footnote carries the REAL deployed constants: '$5 MIN · $100 MAX PER CALL · 1.7% SETTLEMENT FEE' (CLAUDE.md product constraints — same numbers as the signin FEES table)"
    - "Modal is fully static (no fetch(, no wagmi, no useReadContract, no data hooks) and accessible: role=\"dialog\" + aria-modal=\"true\" + aria-label, Escape ALWAYS closes (no tx-in-flight guard — static content), backdrop click closes with panel onClick stopPropagation, ✕ close button top-right with min 44px touch target"
    - "Primary CTA 'MAKE YOUR FIRST CALL ▸' (full-width black fill, cream var(--bg-inverse) text — the modal-panel inverse button idiom) closes the modal then calls handleNewCallClick — the EXACT existing auth branch (signed-in → /new, signed-out → /signin); page.tsx tabs/chips/duels/feed regions stay byte-identical (status-normalization, feed-tabs-chips, presentation-sweep pins all green)"
    - "Source-assertion vitest (presentation-sweep read() pattern) pins the modal content, a11y wiring, page.tsx trigger source-order (HOW IT WORKS before + NEW CALL), static-honesty, AND a copy-canon lockstep drift guard asserting each of the three step bodies appears in BOTH the modal and signin sources"
    - "Gates: pnpm --filter @call-it/web build exit 0 AND pnpm --filter @call-it/web exec vitest run ALL green (357 baseline + new); single atomic commit staging ONLY the 3 explicit paths; NO push; apps/web/app/signin/page.tsx is read-only copy canon — never modified"
  artifacts:
    - path: "apps/web/app/components/HowItWorksModal.tsx"
      provides: "Static Polymarket-style explainer modal on the D-13 cream template — overline, heading, 3 verbatim steps, constants footnote, black full-width CTA"
      min_lines: 100
      contains: "MAKE YOUR FIRST CALL"
    - path: "apps/web/app/page.tsx"
      provides: "howOpen state + HOW IT WORKS ghost trigger left of the auth CTA + HowItWorksModal mount wired to handleNewCallClick"
      contains: "howOpen"
    - path: "apps/web/tests/how-it-works-modal.test.ts"
      provides: "Source-assertion pins: modal content/a11y/static-honesty, page wiring + source order, copy-canon lockstep with signin"
      contains: "GO ON RECORD"
  key_links:
    - from: "apps/web/app/page.tsx"
      to: "apps/web/app/components/HowItWorksModal.tsx"
      via: "named import + JSX mount"
      pattern: "HowItWorksModal"
    - from: "apps/web/app/components/HowItWorksModal.tsx"
      to: "handleNewCallClick"
      via: "onPrimaryCta prop wired in page.tsx"
      pattern: "onPrimaryCta"
    - from: "apps/web/tests/how-it-works-modal.test.ts"
      to: "apps/web/app/signin/page.tsx"
      via: "copy-canon lockstep read of both sources"
      pattern: "signin"
---

<objective>
HOW IT WORKS on the tape (user request 2026-06-12): a `btn ghost` text trigger in the page-header, left of the + NEW CALL / Sign in CTA, opening a Polymarket-style explainer modal — numbered steps with short title + one-liner each and a get-started CTA at the end. Copy is the already-approved landing canon (signin HOW_IT_WORKS array) verbatim; chrome is the app's ONE modal idiom (D-13 cream .modal-panel, mirrored from ChallengeFormModal).

Purpose: new visitors landing on the tape have zero product explanation — the only copy canon lives on /signin, which signed-in users never revisit.
Output: new HowItWorksModal.tsx, page.tsx header wiring, source-assertion vitest with a copy-canon lockstep drift guard. Single atomic commit, 3 staged paths, no push (orchestrator pushes).

All decisions are MADE (orchestrator-verified 2026-06-12) — do not re-litigate copy, chrome, placement, or CTA semantics.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/app/page.tsx                            # state at 160-162; handleNewCallClick 215-223; header right-side flex container 252-273 (display flex, gap 12, alignItems center, gated on `ready`); tabs 277-303 + chips 310-319 are PINNED regions — byte-identical
@apps/web/app/components/ChallengeFormModal.tsx   # D-13 chrome donor: overlay 320-336 (fixed inset 0, z-200, rgba(0,0,0,0.82), blur(4px), e.target===e.currentTarget close); panel 358-382 (var(--bg-inverse), #000 text, 3px black border, shadow-brutal-lg, clamp padding); cream-context overline idiom 425-427; close ✕ 408-414; Escape useEffect 236-243; black-fill primary CTA 599-627
@apps/web/app/signin/page.tsx                     # READ-ONLY copy canon: HOW_IT_WORKS array 153-169 (01 GO ON RECORD / 02 FOLLOW OR FADE / 03 GET YOUR RECEIPT + bodies); 'Three steps. One receipt.' heading 312-316; FEES table 178-183 (same constants as footnote). NEVER MODIFIED.
@apps/web/app/globals.css                         # .btn.ghost 525-534 (exists — duel back link uses it); .modal-panel recipe ~906; .label-overline (dark-bg variant — do NOT use on the cream panel)
@apps/web/tests/presentation-sweep.test.ts        # source-assert style: read() helper line 12 (readFileSync + join(process.cwd(), ...) — cwd is apps/web under --filter); existsSync pattern 50-53
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create HowItWorksModal.tsx — D-13 cream template, landing copy verbatim</name>
  <files>apps/web/app/components/HowItWorksModal.tsx</files>
  <action>
Create NEW FILE `apps/web/app/components/HowItWorksModal.tsx` ('use client').

Header comment block: Polymarket-style explainer modal (user request 2026-06-12); copy canon = apps/web/app/signin/page.tsx HOW_IT_WORKS array; D-13 cream .modal-panel template mirrored from ChallengeFormModal.tsx; static content — no data fetches, no wagmi, no tx-in-flight guards.

Props type (exported): `{ open: boolean; onClose: () => void; onPrimaryCta: () => void }`. Named export `HowItWorksModal`. Render `null` when `!open`.

Duplicate the STEPS array LOCALLY, byte-identical to signin's HOW_IT_WORKS (lines 153-169), with a comment citing apps/web/app/signin/page.tsx as copy canon — do NOT import from the signin page module (page modules must not cross-import; the lockstep test in Task 3 guards drift):
- 01 GO ON RECORD — "Make a call on any crypto market. Pick your conviction. Stake USDC. Your prediction is now permanent and public."
- 02 FOLLOW OR FADE — "Others bet with you or against you. Every position is real money on the line. The market prices your prediction in real time."
- 03 GET YOUR RECEIPT — "When the call settles, the outcome stamps onto your receipt forever. CALLED IT. LOUD AND WRONG. Either way, the world knows."

Escape wiring (mirror ChallengeFormModal 236-243 MINUS the escInFlight guard — this modal is static, Escape always closes): `useEffect` gated on `open`, window keydown listener, `e.key === 'Escape'` → `onClose()`, cleanup on unmount.

CHROME (mirror ChallengeFormModal exactly, per D-13):
- Overlay div: position 'fixed', inset 0, zIndex 200, backgroundColor 'rgba(0,0,0,0.82)', backdropFilter 'blur(4px)', display flex, alignItems/justifyContent center, padding '40px 20px'; onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}.
- Panel div: role="dialog", aria-modal="true", aria-label="How it works"; onClick={(e) => e.stopPropagation()} (belt-and-suspenders with the currentTarget check — the Task 3 test pins `stopPropagation`); style: position relative, backgroundColor 'var(--bg-inverse)', color '#000', border '3px solid #000', boxShadow 'var(--shadow-brutal-lg)', borderRadius 0, padding 'clamp(24px, 5vw, 36px)', width 'min(92vw, 560px)', maxHeight '85vh', overflowY 'auto', display flex, flexDirection column, gap 20px.

PANEL CONTENT top→bottom:
(a) Close ✕ button — absolute or flex-row top-right like the template's (408-414): transparent bg, no border, color 'rgba(0,0,0,0.55)', aria-label="Close", but bump the touch target to minWidth 44 / minHeight 44 (orchestrator a11y requirement — the template's 4px padding is too small here).
(b) Overline "· HOW IT WORKS" — cream-context inline overline idiom (ChallengeFormModal 425-427, NOT the dark-bg .label-overline class): var(--font-mono), 10-11px, fontWeight 700, color 'rgba(0,0,0,0.55)', textTransform uppercase, letterSpacing '0.12em'.
(c) Heading "Three steps. One receipt." — as ONE contiguous string in a single text node (no <br/> — the Task 3 pin asserts the contiguous string): var(--font-display) (Archivo), fontWeight 900, color '#000', fontSize ~clamp(26px, 6vw, 38px), lineHeight ~0.95, margin 0. Keep sentence case exactly as written (the landing renders it sentence-case — no textTransform).
(d) The 3 steps stacked (flex column, gap ~16px). Each step: flex row — mono number ('01'/'02'/'03', var(--font-mono), fontWeight 700, color '#000', fixed-width left column) + a column with bold title (var(--font-display), ~15px, fontWeight 900, uppercase, color '#000') and body one-liner (var(--font-sans), ~13-14px, color 'rgba(0,0,0,0.75)', lineHeight 1.5). Bodies VERBATIM from the local STEPS array.
(e) Footnote line: "$5 MIN · $100 MAX PER CALL · 1.7% SETTLEMENT FEE" — var(--font-mono), ~11px, color 'rgba(0,0,0,0.7)', letterSpacing '0.08em'; separate it with borderTop '1px solid rgba(0,0,0,0.25)' + paddingTop (the template's FINAL-section divider idiom, line 527).
(f) Primary CTA full-width black button — mirror ChallengeFormModal's enabled Send Challenge styling (600-627): width '100%', minHeight 44, color 'var(--bg-inverse)', backgroundColor '#000', border '3px solid #000', boxShadow 'var(--shadow-brutal)', var(--font-display), fontWeight 800, textTransform uppercase, letterSpacing '0.04em', cursor pointer; label exactly "MAKE YOUR FIRST CALL ▸"; onClick={onPrimaryCta}.

STATIC HONESTY: the file must contain NO `fetch(`, NO wagmi imports, NO useReadContract/useWriteContract, NO data-loading useEffect — the only useEffect is the Escape listener.
  </action>
  <verify>
    <automated>cd "apps/web" && pnpm exec tsc --noEmit 2>&1 | grep -c "HowItWorksModal" | grep -q "^0$" && grep -c "MAKE YOUR FIRST CALL" app/components/HowItWorksModal.tsx</automated>
  </verify>
  <done>HowItWorksModal.tsx exists with D-13 chrome, verbatim landing copy (overline + heading + 3 steps), real-constants footnote, black full-width CTA, Escape/backdrop/✕ close wiring, zero data primitives; typecheck clean.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the trigger + modal into the tape page-header</name>
  <files>apps/web/app/page.tsx</files>
  <action>
RE-READ apps/web/app/page.tsx IMMEDIATELY BEFORE EDITING — a parallel Claude session shares this tree; compose with any drift (the line numbers below are 2026-06-12 references, not guarantees).

Three surgical edits ONLY:

1. Import: add `import { HowItWorksModal } from '@/app/components/HowItWorksModal';` alongside the existing `@/app/components/FromYourNetworkSections` import (line ~39 — same alias style).

2. State: add `const [howOpen, setHowOpen] = useState(false);` next to the existing state cluster (activeTab/activeChip/duels, lines ~160-162).

3. Header trigger: inside the existing right-side container — `{ready && (<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>` at lines ~252-273 (it is ALREADY a flex row with gap 12; no wrapper div needed) — insert BEFORE the `{authenticated ? ... : ...}` ternary so BOTH auth branches see it:
`<button type="button" className="btn ghost" onClick={() => setHowOpen(true)} style={{ minHeight: 44 }}>HOW IT WORKS</button>`
This renders the trigger left of + NEW CALL (signed-in) and left of Sign in (signed-out). `.btn.ghost` exists in globals.css (525-534, the duel back-link recipe) — do not add CSS.

4. Modal mount: at the end of the page render, last child before the closing root `</div>`:
`<HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} onPrimaryCta={() => { setHowOpen(false); handleNewCallClick(); }} />`
`handleNewCallClick` (lines ~215-223) IS the exact required branch — authenticated → router.push('/new'), else router.push('/signin'). Reuse it directly; do NOT duplicate the branch.

TOUCH NOTHING ELSE: the tab bar (role="tablist", ~277-303), chip row (~310-319), duels wiring, feed regions, and h1/sub stay byte-identical — they are guarded by status-normalization, feed-tabs-chips, and presentation-sweep test pins.
  </action>
  <verify>
    <automated>cd "apps/web" && grep -c "howOpen" app/page.tsx && grep -c "HOW IT WORKS" app/page.tsx && grep -c "handleNewCallClick" app/page.tsx</automated>
  </verify>
  <done>page.tsx imports + mounts HowItWorksModal; HOW IT WORKS ghost button renders before the auth CTA inside the existing flex container; onPrimaryCta closes the modal and reuses handleNewCallClick; all pinned regions untouched.</done>
</task>

<task type="auto">
  <name>Task 3: Source-assertion test + gates + single atomic commit</name>
  <files>apps/web/tests/how-it-works-modal.test.ts</files>
  <action>
Create NEW FILE `apps/web/tests/how-it-works-modal.test.ts` — vitest source-assertion suite using the presentation-sweep pattern (header comment citing quick-260612-8wk; `const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');` — process.cwd() is apps/web under `pnpm --filter`).

Suites and pins:

1. Modal content + a11y (src = read('app', 'components', 'HowItWorksModal.tsx'); existsSync first):
   - toContain: 'HOW IT WORKS', 'Three steps. One receipt.', 'GO ON RECORD', 'FOLLOW OR FADE', 'GET YOUR RECEIPT', '$5 MIN', '$100 MAX', '1.7%', 'MAKE YOUR FIRST CALL'
   - a11y wiring: 'role="dialog"', 'aria-modal', "'Escape'" (keydown handler), 'stopPropagation' (panel guard), 'aria-label="Close"'

2. Copy-canon lockstep drift guard: declare the three step BODY sentences as consts in the test (verbatim — "Make a call on any crypto market. Pick your conviction. Stake USDC. Your prediction is now permanent and public.", "Others bet with you or against you. Every position is real money on the line. The market prices your prediction in real time.", "When the call settles, the outcome stamps onto your receipt forever. CALLED IT. LOUD AND WRONG. Either way, the world knows.") and assert each appears in BOTH read('app', 'components', 'HowItWorksModal.tsx') AND read('app', 'signin', 'page.tsx'). If the landing copy ever changes, this fails and forces a conscious sync.

3. page.tsx wiring (src = read('app', 'page.tsx')):
   - toContain: 'HowItWorksModal' (import + mount), 'howOpen', 'setHowOpen(true)'
   - source-order pin: `const i = src.indexOf('HOW IT WORKS'); const j = src.indexOf('+ NEW CALL');` assert i > -1, j > -1, and i < j (the trigger renders before the NEW CALL button in source order).

4. Static-honesty pin (modal src): not.toContain('fetch('), not.toContain('useReadContract'), not.toContain('useWriteContract'), not.toContain('wagmi') — pure static content. (Do NOT assert absence of useEffect — the Escape listener legitimately uses it.)

GATES (run from repo root):
- `pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → ALL green (357 baseline + the new suite; zero regressions in status-normalization / feed-tabs-chips / presentation-sweep)

COMMIT (single atomic; stage ONLY the explicit paths — NEVER git add -A/./-u):
`git add "apps/web/app/components/HowItWorksModal.tsx" "apps/web/app/page.tsx" "apps/web/tests/how-it-works-modal.test.ts"`
`git commit -m "feat(quick-260612-8wk): HOW IT WORKS on the tape — Polymarket-style explainer modal (landing copy canon, D-13 cream template) left of NEW CALL"`
NO push (orchestrator pushes). NEVER touch apps/relayer/**, packages/**, 'call it frontend/', docs/, evidence/, .planning/config.json, .gitignore, or apps/web/app/signin/page.tsx (read-only copy canon).
  </action>
  <verify>
    <automated>pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>New test file pins modal content/a11y/static-honesty, page wiring + source order, and the copy-canon lockstep; build exit 0; full vitest run green (357 + new); exactly one commit staging exactly 3 paths; nothing pushed.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → ALL green (357 baseline + how-it-works-modal suite)
- `git show --stat HEAD` → exactly 3 files: HowItWorksModal.tsx (new), page.tsx (modified), how-it-works-modal.test.ts (new)
- `git diff HEAD -- apps/web/app/signin/page.tsx` → empty (copy canon untouched)
- Manual smoke (optional): on the tape, HOW IT WORKS sits left of + NEW CALL (signed-in) / Sign in (signed-out); click → cream D-13 modal with 3 steps + footnote + black CTA; Escape, backdrop, and ✕ all close; CTA routes per auth state.
</verification>

<success_criteria>
- HOW IT WORKS ghost trigger in the tape header, left of the auth-aware CTA, both auth states (user request 2026-06-12)
- Polymarket-style static modal on the D-13 cream template, ChallengeFormModal chrome mirrored exactly
- Landing copy canon verbatim (overline, 'Three steps. One receipt.', 3 steps), real constants footnote, MAKE YOUR FIRST CALL ▸ CTA reusing handleNewCallClick
- a11y: role=dialog, aria-modal, Escape, backdrop + stopPropagation, 44px targets
- Copy-canon lockstep test guards drift between modal and signin sources
- Build + full vitest green; single atomic commit, 3 staged paths, no push
</success_criteria>

<output>
Create `.planning/quick/260612-8wk-how-it-works-modal/SUMMARY.md` when done.
</output>
