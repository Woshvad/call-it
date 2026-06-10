/**
 * CornerBrackets — 4 absolutely-positioned bracket spans
 *
 * Prototype `.bracketed` recipe (Phase 09.2): 14px L-shaped 1px
 * var(--border-active) corner marks, 8px inset. Flexbox/absolute
 * positioning only (Satori-safe — pure spans, no assets, no grid).
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
        className="absolute top-2 left-2 w-[14px] h-[14px] border-t border-l border-[var(--border-active)] pointer-events-none"
      />
      {/* Top-right */}
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 w-[14px] h-[14px] border-t border-r border-[var(--border-active)] pointer-events-none"
      />
      {/* Bottom-left */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-2 w-[14px] h-[14px] border-b border-l border-[var(--border-active)] pointer-events-none"
      />
      {/* Bottom-right */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 right-2 w-[14px] h-[14px] border-b border-r border-[var(--border-active)] pointer-events-none"
      />
    </>
  );
}
