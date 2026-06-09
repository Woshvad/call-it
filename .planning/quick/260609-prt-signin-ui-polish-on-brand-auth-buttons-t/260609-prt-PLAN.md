---
phase: quick-260609-prt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/signin/page.tsx
  - apps/web/app/terms/page.tsx
  - apps/web/app/components/NotificationBell.tsx
  - apps/web/app/signin/SignInButtons.tsx
autonomous: true
requirements: [UI-24, AUTH-37, AUTH-38, SOCIAL-24, SOCIAL-25, D-33]

must_haves:
  truths:
    - "Visiting /signin shows the disclaimer 'By signing in, you're agreeing to our Terms & Conditions.' with 'Terms & Conditions' an on-brand underlined link to /terms"
    - "Clicking the Terms & Conditions link navigates to /terms, which renders a real on-brand page (no 404) preserving the permanent-public-record promise verbatim"
    - "An authenticated user (wallet OR Google/X OAuth) sees the notification bell even before wagmi address resolves; logged-out users never see it (per the user's request)"
    - "The three auth buttons render in D-33 order (Connect Wallet > Google > X) with solid-neobrutalist styling, the third labelled 'Sign in with X' (not Twitter), full-width via className"
  artifacts:
    - path: "apps/web/app/signin/page.tsx"
      provides: "Disclaimer copy swapped to Terms & Conditions link; Link imported from next/link"
      contains: "next/link"
    - path: "apps/web/app/terms/page.tsx"
      provides: "On-brand /terms stub page preserving the permanent-record promise"
      contains: "Terms & Conditions"
    - path: "apps/web/app/components/NotificationBell.tsx"
      provides: "Auth-only gate dropping the && address requirement (WR-03 OAuth address-lag fix)"
      contains: "!ready || !authenticated"
    - path: "apps/web/app/signin/SignInButtons.tsx"
      provides: "Solid-neobrutalist auth buttons + Twitter→X rename + Google/X inline SVG icons"
      contains: "Sign in with X"
  key_links:
    - from: "apps/web/app/signin/page.tsx"
      to: "/terms"
      via: "next/link <Link href=\"/terms\">"
      pattern: "href=[\"']/terms[\"']"
    - from: "apps/web/app/terms/page.tsx"
      to: "/"
      via: "back link"
      pattern: "href=[\"']/[\"']"
---

<objective>
Polish the Call It /signin surface with 4 small, related, already-decided UI changes — all confined to apps/web. Faithful implementation only; no design re-opening.

Purpose: Replace the wall-of-text disclaimer with a clean Terms & Conditions link (backed by a real stub page so it never 404s), make the notification bell appear for OAuth-signed-in users (fixing the latent WR-03 address-lag bug), and give the three auth buttons the solid-neobrutalist treatment while renaming Twitter→X.

Output:
- Modified apps/web/app/signin/page.tsx (disclaimer → Terms link)
- New apps/web/app/terms/page.tsx (on-brand stub)
- Modified apps/web/app/components/NotificationBell.tsx (auth-only gate)
- Modified apps/web/app/signin/SignInButtons.tsx (solid-neobrutalist buttons + X rename + SVG icons)
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@apps/web/app/signin/page.tsx
@apps/web/app/signin/SignInButtons.tsx
@apps/web/app/components/NotificationBell.tsx
@packages/ui/src/primitives/Button.tsx

# Brand tokens (verified, do NOT edit packages/ui): brand-accent #E8F542, brand-bg #09090E,
# brand-surface #18181B, font-mono = JetBrains Mono. Tooltip/disclaimer/heading inline-style
# patterns are visible in signin/page.tsx above — mirror them for /terms.

## CRITICAL repo rules (read before touching git)
- Stage ONLY the files you edit/create with explicit `git add <path>`. NEVER `git add -A` or
  `git add .` — a background soak has unrelated uncommitted files in the working tree.
- Commit to current branch (master); branching_strategy is none. DO NOT push.
- Scope is apps/web ONLY. DO NOT modify packages/ui — put focus rings / overrides at the call
  sites (className on the shared Button), not in the shared Button base.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Disclaimer copy → Terms & Conditions link (signin/page.tsx)</name>
  <files>apps/web/app/signin/page.tsx</files>
  <action>
    In apps/web/app/signin/page.tsx, add `import Link from 'next/link';` near the existing
    top-of-file imports (it is not currently imported). Then edit ONLY the text content of the
    existing disclaimer paragraph (the `<p data-testid="disclaimer">` around lines 188-201).
    Keep the `<p>` element, its inline `style` object, and the `data-testid="disclaimer"`
    attribute EXACTLY as-is. Replace the inner text "By signing in you agree that your calls
    become permanent public record. No edits. No deletes. Wins and losses both count." with:
    By signing in, you're agreeing to our Terms & Conditions. — where "Terms & Conditions" is a
    `<Link href="/terms">` styled on-brand inline with `style={{ color: '#E8F542',
    textDecoration: 'underline' }}`. Write the apostrophe in "you're" as `&apos;` and the
    ampersand in "Terms &amp; Conditions" as `&amp;` to keep the JSX valid. Do not touch any
    other element on the page (title, subtitle, Card, SignInButtons, loading skeleton).
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('apps/web/app/signin/page.tsx','utf8'); const ok = /import Link from 'next\/link'/.test(s) && /data-testid=\"disclaimer\"/.test(s) && /href=\"\/terms\"/.test(s) && /agreeing to our/.test(s) && /Terms &amp; Conditions/.test(s) && !/permanent public record\./.test(s); if(!ok){console.error('FAIL: page.tsx disclaimer/link assertions');process.exit(1)} console.log('OK')"</automated>
  </verify>
  <done>page.tsx imports Link from next/link; the disclaimer `<p>` keeps its style + data-testid="disclaimer" but now reads "By signing in, you're agreeing to our Terms & Conditions." with the phrase as an underlined #E8F542 Link to /terms; the old "permanent public record…" sentence is gone from page.tsx.</done>
</task>

<task type="auto">
  <name>Task 2: Create /terms stub page (new file apps/web/app/terms/page.tsx)</name>
  <files>apps/web/app/terms/page.tsx</files>
  <action>
    Create apps/web/app/terms/page.tsx as a minimal on-brand placeholder so the Task 1 link
    never 404s. No auth, no data fetching, no hooks — a plain default-exported server component
    is fine (no 'use client' needed). Mirror signin/page.tsx's inline-style approach: a centered
    `<main>` with dark bg `#09090E`, `minHeight: '100vh'`, flex column, centered, padding, and a
    max-width container (~480px). Render:
    - an h1 "Terms &amp; Conditions" styled like the signin heading family — accent color
      `#E8F542`, `fontFamily: "'Syne', sans-serif"`, bold, uppercase (smaller than the giant 6rem
      signin title — use ~2rem so the page reads as a content page, not a hero).
    - a line "Full terms are coming soon." in muted mono/Space-Grotesk body (`#A1A1AA`,
      `fontFamily: 'monospace'`).
    - a paragraph included VERBATIM (this preserves the product promise the old disclaimer
      carried): "By using Call It and signing in, you acknowledge that your calls become a
      permanent public record. No edits. No deletes. Wins and losses both count." — muted body
      style, written with valid JSX (no special escaping needed for this string).
    - a back link to "/" using `import Link from 'next/link'` → `<Link href="/">` reading
      something like "&larr; Back to Call It", styled on-brand (accent or underlined).
    Keep it simple; use flexbox only (Satori-safe habit — no css grid).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const p='apps/web/app/terms/page.tsx'; if(!fs.existsSync(p)){console.error('FAIL: terms/page.tsx missing');process.exit(1)} const s=fs.readFileSync(p,'utf8'); const ok = /Terms &amp; Conditions|Terms & Conditions/.test(s) && /Full terms are coming soon/.test(s) && /permanent public record\. No edits\. No deletes\. Wins and losses both count\./.test(s) && /href=\"\/\"/.test(s) && /next\/link/.test(s) && !/grid/.test(s); if(!ok){console.error('FAIL: terms/page.tsx content assertions');process.exit(1)} console.log('OK')"</automated>
  </verify>
  <done>apps/web/app/terms/page.tsx exists, on-brand (dark bg, accent Syne heading, mono body, centered max-width), contains the "Full terms are coming soon." line, the verbatim permanent-public-record promise paragraph, and a next/link back link to "/". No grid usage.</done>
</task>

<task type="auto">
  <name>Task 3: Gate notification bell on auth only (NotificationBell.tsx line 130)</name>
  <files>apps/web/app/components/NotificationBell.tsx</files>
  <action>
    In apps/web/app/components/NotificationBell.tsx, change the render gate at line 130 from
    `if (!ready || !authenticated || !address) return null;` to
    `if (!ready || !authenticated) return null;` — dropping ONLY the `|| !address` clause.
    Update the adjacent comment (currently "// Only render when authenticated and Privy is
    ready") to: "// render when authenticated + ready (address may lag for OAuth — WR-03)".
    Do NOT touch the fetch guard at ~line 77 (`if (!authenticated || !address || !RELAYER_URL)
    return;`) or the polling-effect guard at ~line 97 (`if (!authenticated || !address)
    return;`) — those keep guarding on address so the bell shows with no badge until address
    resolves and never fires a fetch with an empty address. Logged-out users
    (authenticated===false) remain hidden. No other change to this file.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('apps/web/app/components/NotificationBell.tsx','utf8'); const gate = /if \(!ready \|\| !authenticated\) return null;/.test(s); const noOldGate = !/if \(!ready \|\| !authenticated \|\| !address\) return null;/.test(s); const fetchGuard = /if \(!authenticated \|\| !address \|\| !RELAYER_URL\) return;/.test(s); const comment = /WR-03/.test(s); const ok = gate && noOldGate && fetchGuard && comment; if(!ok){console.error('FAIL: NotificationBell gate assertions', {gate,noOldGate,fetchGuard,comment});process.exit(1)} console.log('OK')"</automated>
  </verify>
  <done>NotificationBell render gate is `if (!ready || !authenticated) return null;` (no `&& address`); the fetch guard at ~line 77 still includes `!address`; the comment references WR-03; logged-out stays hidden, OAuth-signed-in shows the bell before address resolves.</done>
</task>

<task type="auto">
  <name>Task 4: Solid-neobrutalist auth buttons + Twitter→X rename (SignInButtons.tsx)</name>
  <files>apps/web/app/signin/SignInButtons.tsx</files>
  <action>
    In apps/web/app/signin/SignInButtons.tsx, restyle the three shared `<Button>` elements and
    rename the Twitter label to X. PRESERVE EXACTLY: D-33 order (Connect Wallet > Google > X),
    all three data-testid values (btn-connect-wallet, btn-google, btn-twitter — KEEP btn-twitter
    even though the visible label becomes "Sign in with X"), the `<CustodyTooltip>` wrappers on
    Google + X, the `disabled={!ready && !privyTimedOut}` props on Google + X, and every onClick
    handler (handleConnectWallet, handleGoogleLogin, handleTwitterLogin) including their bodies.
    Do NOT rename the handlers. Replace each `style={{ width: '100%' }}` with `w-full` inside a
    className on all three buttons (remove the inline width style).

    Connect Wallet button: keep intent="primary" size="lg", NO icon (text "Connect Wallet" only),
    add className:
    `w-full font-mono uppercase tracking-wide font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg`

    Google + X buttons (BOTH): keep intent="secondary" size="lg", add the SAME className to both:
    `w-full font-mono uppercase tracking-wide font-semibold bg-brand-surface text-white border-2 border-brand-accent shadow-[4px_4px_0_0_#000] transition-all duration-100 ease-out hover:bg-brand-accent hover:text-black hover:border-black hover:shadow-[3px_3px_0_0_#E8F542] active:shadow-[2px_2px_0_0_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg`
    Use `transition-all` (NOT `transition-colors transition-transform`) — tailwind-merge
    collapses two transition-property utilities and would drop the color animation.

    Icons (leading, INSIDE each OAuth button, flexbox only — NO css grid). Wrap the button
    children as `<span className="inline-flex items-center gap-2">{icon}LABEL</span>`:
    - Google: the official 4-COLOR Google "G" inline multicolor SVG (the standard 4-path
      blue/green/yellow/red mark), `className="h-5 w-5 shrink-0"`, `aria-hidden="true"`. Do NOT
      recolor to currentColor — the four brand colors must read on BOTH the dark rest fill and
      the accent hover fill.
    - X: the monochrome X (Twitter) logo inline SVG with `fill="currentColor"`,
      `className="h-[18px] w-[18px] shrink-0"`, `aria-hidden="true"` — so it is white at rest and
      auto-flips to black on the accent hover (because hover sets `text-black`).
    Labels: "Connect Wallet", "Sign in with Google", and RENAME the third label
    "Sign in with Twitter" → "Sign in with X". The `uppercase` class renders them caps visually
    while the JSX text nodes stay readable.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('apps/web/app/signin/SignInButtons.tsx','utf8'); const order = s.indexOf('btn-connect-wallet') < s.indexOf('btn-google') && s.indexOf('btn-google') < s.indexOf('btn-twitter'); const ids = /btn-connect-wallet/.test(s) && /btn-google/.test(s) && /btn-twitter/.test(s); const xlabel = /Sign in with X/.test(s) && !/Sign in with Twitter/.test(s); const wfull = !/width: '100%'/.test(s) && (s.match(/w-full/g)||[]).length>=3; const transAll = /transition-all/.test(s) && !/transition-colors transition-transform/.test(s); const ring = /focus-visible:ring-2/.test(s); const noGrid = !/\\bgrid\\b/.test(s); const handlers = /handleConnectWallet/.test(s) && /handleGoogleLogin/.test(s) && /handleTwitterLogin/.test(s); const ok = order && ids && xlabel && wfull && transAll && ring && noGrid && handlers; if(!ok){console.error('FAIL', {order,ids,xlabel,wfull,transAll,ring,noGrid,handlers});process.exit(1)} console.log('OK')"</automated>
  </verify>
  <done>Three buttons in D-33 order with data-testids btn-connect-wallet/btn-google/btn-twitter intact; CustodyTooltip wrappers + disabled props + all three handlers preserved; inline width:'100%' replaced by w-full; OAuth buttons use the solid-neobrutalist className with transition-all (not split transitions) + focus rings; Google has the 4-color G SVG and X has the currentColor X SVG, both flexbox-wrapped; third label renamed "Sign in with X".</done>
</task>

</tasks>

<verification>
After all four tasks, run the web build and confirm the invariants hold:

1. Build passes:
   `pnpm --filter @call-it/web build` exits 0.
2. data-testids unchanged across signin: btn-connect-wallet, btn-google, btn-twitter (label
   changed, testid kept), and disclaimer.
3. D-33 order preserved (Connect Wallet > Google > X) — see Task 4 ordering assertion.
4. New /terms route resolves (apps/web/app/terms/page.tsx exists and builds; no 404).
5. No edits to packages/ui (focus rings live at the call sites only).

Git (current branch master, NO push, explicit staging only):
- Stage ONLY: `git add apps/web/app/signin/page.tsx apps/web/app/terms/page.tsx apps/web/app/components/NotificationBell.tsx apps/web/app/signin/SignInButtons.tsx`
- NEVER `git add -A` / `git add .` (background soak has unrelated uncommitted files).
- Commit to master with the GSD co-author trailer. Do NOT push.
</verification>

<success_criteria>
- /signin disclaimer reads "By signing in, you're agreeing to our Terms & Conditions." with an on-brand underlined link to /terms; data-testid="disclaimer" preserved.
- /terms renders an on-brand page (no 404) that preserves the permanent-public-record promise verbatim and links back to /.
- Notification bell renders for any authenticated user (including OAuth before address resolves) and stays hidden when logged out; fetch still guarded on address.
- Three auth buttons render solid-neobrutalist, full-width via className, D-33 order, with Google 4-color G + monochrome X SVGs and the third label "Sign in with X"; all data-testids, handlers, CustodyTooltip wrappers, and disabled props unchanged.
- `pnpm --filter @call-it/web build` exits 0; packages/ui untouched; committed to master; not pushed.
</success_criteria>

<output>
Create `.planning/quick/260609-prt-signin-ui-polish-on-brand-auth-buttons-t/260609-prt-SUMMARY.md` when done.
</output>
