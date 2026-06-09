# Phase 9: Mobile responsive on 7 critical pages - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 9-mobile-responsive-on-7-critical-pages
**Areas discussed:** Responsive mechanism, Mobile nav & sidebar, Desktop-only banner, Real-device validation

---

## Responsive mechanism

### Core technique (375px breakpoint on an inline-styled app)
| Option | Description | Selected |
|--------|-------------|----------|
| useIsMobile() hook + conditional style objects | Client hook reads viewport; components branch desktop/mobile style objects; fits inline pattern, no specificity fights | ✓ |
| @media in globals.css | Keep inline base, override at breakpoint; needs !important on every rule (inline beats external CSS) | |
| Migrate 7 pages to Tailwind | Rewrite inline → className + responsive variants; cleanest long-term but large rewrite + desktop-regression risk | |
| You decide | Defer to Claude | |

**User's choice:** useIsMobile() hook + conditional style objects
**Notes:** Driven by the codebase reality — inline styles can't carry @media; CSS can't override inline without !important.

### First-paint behavior (share-landing receipt priority)
| Option | Description | Selected |
|--------|-------------|----------|
| Mobile-first default | SSR/first paint renders mobile, widens to desktop on large viewport; share visitor sees correct layout instantly | ✓ |
| Desktop-first default | Mobile users get a brief desktop flash then snap; worst case for the share visitor | |
| Mounted-gate skeleton | Skeleton until measured, then paint once; no flash but adds delay | |
| You decide | Defer to Claude | |

**User's choice:** Mobile-first default

### 44×44px touch-target enforcement scope
| Option | Description | Selected |
|--------|-------------|----------|
| Mobile breakpoint only | Bump to ≥44px only when isMobile; desktop keeps dense density | ✓ |
| Globally, all viewports | Raise everywhere; one code path but inflates dense desktop look | |
| You decide | Defer to Claude | |

**User's choice:** Mobile breakpoint only

### Reach of the responsive pass
| Option | Description | Selected |
|--------|-------------|----------|
| Pages + modals/cards they show | Pages AND the modals/shared components rendered at 375px (Follow/Fade/Challenge modals, @call-it/ui cards) | ✓ |
| Page wrappers only | Only top-level containers; leaves modals/cards overflowing | |
| You decide | Defer to Claude | |

**User's choice:** Pages + modals/cards they show

---

## Mobile nav & sidebar

### What the mobile nav should be (no sidebar exists today)
| Option | Description | Selected |
|--------|-------------|----------|
| Add a hamburger drawer | Mobile-only hamburger in GlobalNav opening a destinations drawer; satisfies UI-49 + fills a real gap | ✓ |
| Keep minimal top nav, document N/A | No sidebar → no-op; wordmark + bell fit; thin mobile nav | |
| You decide | Defer to Claude | |

**User's choice:** Add a hamburger drawer
**Notes:** App has no left sidebar today — GlobalNav is wordmark + notification bell only.

### Drawer contents + bell placement
| Option | Description | Selected |
|--------|-------------|----------|
| Auth-aware links; bell stays in top bar | Drawer: Feed/Leaderboard/Profile/New Call/Sign in-out (auth-gated); bell pinned in bar | ✓ |
| Everything in the drawer (incl. bell) | Top bar = wordmark + hamburger only; buries unread badge | |
| You decide | Defer to Claude | |

**User's choice:** Auth-aware links; bell stays in top bar

### Hamburger on the 3 desktop-only-banner pages?
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — hamburger works on banner pages | Global hamburger stays active; satisfies SC2 return-nav/sign-out | ✓ |
| No — hide nav on banner pages | Suppress hamburger; banner must carry its own nav/sign-out | |
| You decide | Defer to Claude | |

**User's choice:** Yes — hamburger works on banner pages

---

## Desktop-only banner

### Blocking behavior on non-responsive Duel/Quote/New Call
| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow use | Banner on top; non-responsive page renders interactive below; satisfies SC2 | ✓ |
| Soft-gate (tap to continue) | Banner takes over viewport; page renders after tap; more protective, more bespoke | |
| You decide | Defer to Claude | |

**User's choice:** Warn but allow use

### Dismissibility + copy/CTA
| Option | Description | Selected |
|--------|-------------|----------|
| Dismissible for the session | "Best viewed on desktop" + subtext + [×]; neobrutalist; no extra CTA (hamburger covers exit) | ✓ |
| Persistent (non-dismissible) | Always shows; can nag on repeat visits | |
| You decide | Defer to Claude | |

**User's choice:** Dismissible for the session

---

## Real-device validation

### Validation structure (SC3 needs real iOS Safari + Android Chrome)
| Option | Description | Selected |
|--------|-------------|----------|
| Playwright gate + operator real-device checkpoint | Automated mechanical checks at 375/390px + operator real-device sign-off | ✓ |
| Operator real-device only | No automated tests; manual only; no CI regression guard | |
| Emulation only | 375px Playwright/DevTools only; misses real Safari quirks | |
| You decide | Defer to Claude | |

**User's choice:** Playwright gate + operator real-device checkpoint

### How the two halves gate phase completion
| Option | Description | Selected |
|--------|-------------|----------|
| Playwright blocks; operator check deferrable | Playwright is the hard gate; real-device sign-off rides soak/Phase-10 | |
| Both hard gates before phase complete | Both Playwright AND operator real-device must pass to complete Phase 9 | ✓ |
| You decide | Defer to Claude | |

**User's choice:** Both hard gates before phase complete
**Notes:** Diverged from the recommended deferrable option — user wants a genuine real-device sign-off as a hard gate, accepting that completion is coupled to operator device availability.

---

## Claude's Discretion

- Exact `isMobile` threshold — single breakpoint `< 768px` unless research argues for a tablet tier.
- Per-page layout restructuring details (column stacking, full-width button application).
- Reuse the `NotificationInbox` slide-over/overlay pattern for the drawer; close on link-tap / backdrop / Esc.
- One shared `<DesktopOnlyBanner>` component, mobile-only, pushes content (no overlay).
- SSR-safe hook implementation honoring the mobile-first default.

## Deferred Ideas

- Full responsive pass on the 3 non-critical pages — v1.1+ (PROJECT.md Out of Scope).
- Tablet-specific (768–1024px) layout tier — not required by spec for v1.
- Migrating the inline-style architecture to Tailwind — considered and rejected for this phase; possible future tech-debt cleanup.
