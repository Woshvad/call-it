'use client';

/**
 * Design-system showcase page — dev-only, not linked in production navigation.
 *
 * Route: /_dev/design-system
 *
 * Access is controlled by NEXT_PUBLIC_DEV_ROUTES=1 env var.
 * In production (NEXT_PUBLIC_DEV_ROUTES unset or falsy), the page renders a
 * 404-like message so it cannot leak design-system primitives to search bots
 * or casual visitors.
 *
 * This page is the snapshot target for:
 *   apps/web/tests/design-system-snap.spec.ts
 *
 * T-01-70 mitigation: /_dev/ convention + env guard.
 * Requirement: UI-38..UI-43 (design-system baseline snapshot)
 * Plan: 01-10, Task 2
 */

import React from 'react';
import {
  Button,
  Tag,
  CornerBrackets,
  SkeletonFeedCard,
  SkeletonReceipt,
  SkeletonProfileHeader,
  SkeletonLeaderboardRow,
  SkeletonDuelCard,
  SkeletonListItem,
  Stamp,
  ConvictionBar,
  useToast,
} from '@call-it/ui';

// ── Toast trigger wrapper ──────────────────────────────────────────────────

function ToastTrigger() {
  const { show } = useToast();
  return (
    <Button
      intent="secondary"
      size="sm"
      onClick={() => {
        show({ message: 'Called It — transaction confirmed.', status: 'success' });
        show({ message: 'Broadcasting to the chain…', status: 'info' });
        show({ message: 'Transaction failed: insufficient USDC balance.', status: 'error' });
      }}
      data-testid="trigger-toasts"
    >
      Trigger toasts
    </Button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  // T-01-70: guard — only render full primitives when dev routes are enabled
  if (process.env['NEXT_PUBLIC_DEV_ROUTES'] !== '1') {
    return (
      <div className="p-8 font-mono text-brand-muted text-sm">
        Design-system showcase is disabled in this environment.
        Set NEXT_PUBLIC_DEV_ROUTES=1 to enable.
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-brand-bg p-8 space-y-12 font-body"
      data-testid="design-system-page"
    >
      <h1 className="font-display text-3xl font-bold text-brand-fg border-b-2 border-black pb-4">
        @call-it/ui — Design System
      </h1>

      {/* ── Buttons: 3 intents × 3 sizes ──────────────────────────────── */}
      <section data-testid="section-buttons">
        <h2 className="font-display text-xl font-semibold mb-4">Button (3×3)</h2>
        <div className="flex flex-wrap gap-4 items-start">
          {(['primary', 'secondary', 'danger'] as const).map((intent) =>
            (['sm', 'md', 'lg'] as const).map((size) => (
              <Button key={`${intent}-${size}`} intent={intent} size={size}>
                {intent} / {size}
              </Button>
            ))
          )}
        </div>
      </section>

      {/* ── Tags: 4 intents ───────────────────────────────────────────── */}
      <section data-testid="section-tags">
        <h2 className="font-display text-xl font-semibold mb-4">Tag (4 intents)</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <Tag intent="info">INFO</Tag>
          <Tag intent="success">CALLED IT</Tag>
          <Tag intent="warning">LIVE</Tag>
          <Tag intent="danger">WRONG</Tag>
        </div>
      </section>

      {/* ── CornerBrackets ────────────────────────────────────────────── */}
      <section data-testid="section-corner-brackets">
        <h2 className="font-display text-xl font-semibold mb-4">CornerBrackets</h2>
        <div className="relative inline-block">
          <CornerBrackets size={12} strokeWidth={2} className="text-brand-accent">
            <div className="px-6 py-4 font-mono text-sm text-brand-fg">
              Corner-bracketed content block
            </div>
          </CornerBrackets>
        </div>
      </section>

      {/* ── Skeleton variants (6) ─────────────────────────────────────── */}
      <section data-testid="section-skeletons">
        <h2 className="font-display text-xl font-semibold mb-4">Skeleton (6 variants)</h2>
        <div className="flex flex-col gap-4 max-w-lg">
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">Feed Card</p>
            <SkeletonFeedCard />
          </div>
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">Receipt</p>
            <SkeletonReceipt />
          </div>
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">Profile Header</p>
            <SkeletonProfileHeader />
          </div>
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">Leaderboard Row</p>
            <SkeletonLeaderboardRow />
          </div>
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">Duel Card</p>
            <SkeletonDuelCard />
          </div>
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">List Item</p>
            <SkeletonListItem />
          </div>
        </div>
      </section>

      {/* ── Stamp (4 color variants) ──────────────────────────────────── */}
      <section data-testid="section-stamp">
        <h2 className="font-display text-xl font-semibold mb-4">Stamp (4 colors)</h2>
        <div className="flex flex-wrap gap-8 items-center">
          <Stamp word="CALLED IT" color="outcome-win" />
          <Stamp word="WRONG" color="outcome-loss" />
          <Stamp word="CONTRARIAN" color="outcome-contrarian" />
          <Stamp word="PENDING" color="brand-muted" />
        </div>
      </section>

      {/* ── ConvictionBar (3 values) ───────────────────────────────────── */}
      <section data-testid="section-conviction-bar">
        <h2 className="font-display text-xl font-semibold mb-4">ConvictionBar</h2>
        <div className="flex flex-col gap-4 max-w-sm">
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">conviction=1 (min)</p>
            <ConvictionBar value={1} />
          </div>
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">conviction=50 (mid)</p>
            <ConvictionBar value={50} />
          </div>
          <div>
            <p className="text-xs font-mono text-brand-muted mb-1">conviction=100 (max)</p>
            <ConvictionBar value={100} />
          </div>
        </div>
      </section>

      {/* ── Toast trigger ─────────────────────────────────────────────── */}
      <section data-testid="section-toasts">
        <h2 className="font-display text-xl font-semibold mb-4">Toast (3 statuses)</h2>
        <p className="text-sm text-brand-muted mb-3 font-mono">
          Click to fire success + info + error toasts simultaneously.
        </p>
        <ToastTrigger />
      </section>
    </div>
  );
}
