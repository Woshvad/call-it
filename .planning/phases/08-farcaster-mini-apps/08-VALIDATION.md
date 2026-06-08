---
phase: 8
slug: farcaster-mini-apps
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | {detect during planning — apps/web uses the repo's existing test runner; relayer uses its own} |
| **Config file** | {path or "none — Wave 0 installs"} |
| **Quick run command** | `{quick command}` |
| **Full suite command** | `{full command}` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | SHARE-19 | T-8-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **Nyquist note (from RESEARCH §Validation Architecture):** SC1 (embed meta + manifest) and the Frame `tx` endpoint wire format are validatable on Sepolia WITHOUT live Warpcast — fetch receipt HTML and assert `fc:miniapp`/`fc:frame` tags; fetch `/.well-known/farcaster.json` and assert the pinned schema; assert the tx endpoint returns a well-formed `eth_sendTransaction` wire object for a known callId. The live in-Warpcast tap-to-broadcast (SC2) is genuinely NOT testable on testnet (Sepolia not in Warpcast's chainList) and is correctly a Phase-10 gate (D-01) → record under Manual-Only / deferred, not as a red test.

---

## Wave 0 Requirements

- [ ] {test stubs for SHARE-19 — embed meta assertion, manifest schema assertion, tx-wire assertion}
- [ ] {shared fixtures — a known seeded Sepolia callId in each status (live / settled / caller-exited / duel)}

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live in-Warpcast tap-to-transact (Follow/Fade/Challenge broadcasts) | SHARE-19 / SC2 | Sepolia is not in Warpcast's supported chainList; live broadcast needs production Warpcast + a chain it broadcasts to (D-01) — **Phase-10 gate, not a Phase-8 failure** | Deferred to Phase 10 mainnet smoke test |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
