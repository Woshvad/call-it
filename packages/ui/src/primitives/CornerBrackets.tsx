/**
 * CornerBrackets — 4 absolutely-positioned bracket spans
 *
 * CSS pseudo-element corner brackets (D-17).
 * Visual parity with apps/web/lib/og-fallback-render.ts cornerBracket() helper.
 * Phase 7 OG card templates reuse this pattern (Satori-safe — pure spans, no assets).
 *
 * Parent MUST be `position: relative`.
 * Component is purely presentational (aria-hidden on each span).
 *
 * @example
 *   <div className="relative">
 *     <CornerBrackets />
 *     <content />
 *   </div>
 */
export function CornerBrackets() {
  return (
    <>
      {/* Top-left */}
      <span
        aria-hidden="true"
        className="absolute top-2 left-2 w-4 h-4 border-t-4 border-l-4 border-brand-accent pointer-events-none"
      />
      {/* Top-right */}
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 w-4 h-4 border-t-4 border-r-4 border-brand-accent pointer-events-none"
      />
      {/* Bottom-left */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-2 w-4 h-4 border-b-4 border-l-4 border-brand-accent pointer-events-none"
      />
      {/* Bottom-right */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 right-2 w-4 h-4 border-b-4 border-r-4 border-brand-accent pointer-events-none"
      />
    </>
  );
}
