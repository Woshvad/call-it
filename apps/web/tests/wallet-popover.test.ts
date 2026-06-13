/**
 * Wallet pill popover source gates — quick-260611-scj.
 *
 * Source-assert style (presentation-sweep convention — node env, no DOM):
 * pins the WalletPill extraction + popover behavior so a refactor can't
 * silently revert them. Robust-but-honest: substring/regex + index-order
 * structural checks, never line numbers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

const pill = () => read('app', 'components', 'WalletPill.tsx');

describe('wallet popover — extraction', () => {
  it('WalletPill.tsx exists as its own component file', () => {
    expect(existsSync(join(process.cwd(), 'app', 'components', 'WalletPill.tsx'))).toBe(
      true,
    );
  });

  it('AppShell imports WalletPill and no longer owns the inline pill', () => {
    const shell = read('app', 'components', 'AppShell.tsx');
    expect(shell).toContain("import { WalletPill } from './WalletPill'");
    expect(shell).not.toContain('useUsdcBalance');
  });

  it('pill face is a button popover anchor with dialog ARIA', () => {
    const src = pill();
    expect(src).toContain('<button');
    expect(src).toContain('aria-haspopup="dialog"');
    expect(src).toContain('aria-expanded');
  });
});

describe('wallet popover — copy own address', () => {
  it('COPY button writes profileAddr to the clipboard with a 2s COPIED reset', () => {
    const src = pill();
    expect(src).toContain('navigator.clipboard.writeText(profileAddr)');
    expect(src).toContain("'COPIED'");
    expect(src).toContain('2000');
  });
});

describe('wallet popover — close handlers', () => {
  it('closes on Escape keydown and on outside mousedown (wrapper contains check)', () => {
    const src = pill();
    expect(src).toContain("'keydown'");
    expect(src).toContain("'Escape'");
    expect(src).toContain("'mousedown'");
    expect(src).toContain('.contains(');
  });
});

describe('wallet popover — quick links', () => {
  it('footer links to /profile/{addr} and /profile/{addr}/settings', () => {
    const src = pill();
    expect(src).toMatch(/\/profile\/\$\{profileAddr\}`/);
    expect(src).toMatch(/\/profile\/\$\{profileAddr\}\/settings/);
  });
});

describe('wallet popover — AUTH-44 pill-face contract', () => {
  it('the panel (and the address inside it) only exists behind the open gate', () => {
    const src = pill();
    expect(src).toMatch(/open && profileAddr &&/);

    const gateIdx = src.search(/open && profileAddr &&/);
    const slice06 = src.search(/profileAddr\.slice\(\s*0\s*,\s*6\s*\)/);
    const sliceNeg4 = src.search(/profileAddr\.slice\(\s*-4\s*\)/);

    // Both truncated-address interpolations exist…
    expect(slice06).toBeGreaterThan(-1);
    expect(sliceNeg4).toBeGreaterThan(-1);
    // …and ONLY after the gated-panel block begins: no address rendering
    // anywhere before the `{open && profileAddr && (` gate (the pill face
    // region precedes it in source).
    expect(slice06).toBeGreaterThan(gateIdx);
    expect(sliceNeg4).toBeGreaterThan(gateIdx);
    expect(src.slice(0, gateIdx)).not.toMatch(/profileAddr\.slice\(/);
  });
});

describe('wallet popover — face is balance-only', () => {
  it('the pill face renders no handle — it lives in the panel headline (user decision 2026-06-11)', () => {
    const src = pill();
    const gateIdx = src.search(/open && profileAddr &&/);
    // No handle interpolation in the face region (before the gated panel)…
    expect(src.slice(0, gateIdx)).not.toMatch(/\{handle\}/);
    // …while the panel headline still renders it.
    expect(src.slice(gateIdx)).toContain('@{handle}');
  });
});

describe('wallet popover — handle casing', () => {
  it('handles render AS STORED — no uppercase transform', () => {
    const src = pill();
    expect(src).toContain("textTransform: 'none'");
    expect(src).not.toMatch(/textTransform:\s*'uppercase'/);
  });
});

describe('wallet popover — sign out', () => {
  it('pulls logout from usePrivy and renders a SIGN OUT control that calls logout()', () => {
    const src = pill();
    // logout is destructured from the Privy hook (desktop logout, user 2026-06-13)
    expect(src).toMatch(/const\s*\{[^}]*\blogout\b[^}]*\}\s*=\s*usePrivy\(\)/);
    // the SIGN OUT control exists and invokes logout()
    expect(src).toContain('SIGN OUT');
    expect(src).toContain('data-testid="wallet-signout"');
    expect(src).toContain('logout()');
  });

  it('sign out closes the popover (setOpen(false)) like the other footer actions', () => {
    const src = pill();
    expect(src).toMatch(/void logout\(\);\s*setOpen\(false\)/);
  });
});
