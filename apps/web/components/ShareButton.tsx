/**
 * ShareButton — reusable manual Share affordance (SHARE-15).
 *
 * Generates a Twitter web-intent URL via the shared share-text builder
 * (`twitterIntentUrl` + `buildShareText` from apps/web/lib/share-text.ts, which
 * re-exports the canonical pure builders in @call-it/shared — the SAME logic the
 * relayer auto-post worker uses, 07-04). Renders as an anchor so the href is a real
 * `twitter.com/intent/tweet` URL (no JS required to share, and assertable in tests).
 *
 * Reusable across the quote success screen, receipt page, and profile page — pass a
 * receipt URL + outcome word + handle + optional statement.
 *
 * PURITY: the builder is pure (no secrets, statement URL-encoded). The X write token
 * lives ONLY in the relayer (07-04); it never passes through this component.
 *
 * Requirements: SHARE-15, UI-28
 */

'use client';

import { twitterIntentUrl, buildShareText } from '@/lib/share-text';

interface ShareButtonProps {
  /** Public URL of the receipt/call being shared (becomes the intent `url` param). */
  receiptUrl: string;
  /** Settled outcome word, e.g. "CALLED IT" / "LOUD AND WRONG". */
  outcomeWord: string;
  /**
   * Caller handle (with or without leading @). OPTIONAL (WR-11, 260612-hi3) —
   * buildShareText's isRealHandle guard omits the @segment entirely for
   * absent/0x/numeric handles, so no placeholder is ever needed here.
   */
  handle?: string;
  /** Optional human-readable market statement (D-03 Call.statement). */
  statement?: string;
  /** Button label override (default "Share receipt"). */
  label?: string;
}

export function ShareButton({
  receiptUrl,
  outcomeWord,
  handle,
  statement,
  label = 'Share receipt',
}: ShareButtonProps) {
  const text = buildShareText({ outcomeWord, handle, statement });
  const href = twitterIntentUrl(receiptUrl, text);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // Accent CTA per UI-SPEC §Color reserved list #1 (primary share CTA). Mirrors
      // the @call-it/ui Button primary variant treatment (accent bg, hard offset shadow).
      className="inline-flex items-center justify-center font-body font-semibold border-2 border-black bg-brand-accent text-black px-6 py-3 text-lg shadow-[4px_4px_0_0_#000] cursor-pointer select-none"
      style={{ textDecoration: 'none' }}
      data-testid="share-button"
    >
      {label}
    </a>
  );
}
