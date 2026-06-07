/**
 * Custom ESLint flat-config rule: no-display-grid (Pitfall 15 enforcement gate).
 *
 * Satori — the HTML→SVG renderer underneath @vercel/og — supports `display: flex`
 * ONLY. `display: 'grid'` and any `grid*` property silently misrender (the layout
 * collapses; e.g. the "CALLED IT" word vanishes at 200px on X). This rule is the
 * trust-boundary guard between OG source files and the Satori renderer (T-07-01-01).
 *
 * It replaces the obsolete string-match "rule" that lived in
 * apps/web/tests/og-fallback.spec.ts (Test 5) which only `console.warn`-ed and
 * never failed a build.
 *
 * Wire into eslint.config.js scoped to:
 *   files: ['app/og/** /*.{ts,tsx}', 'app/api/og/** /*.ts', 'lib/og-*.ts']
 *
 * AST shape: matches object-literal style props (`Property` nodes). Flags:
 *   - display: 'grid'  → "Satori does not support display:'grid' — use flexbox."
 *   - gridTemplate* / gridColumn* / gridRow* / gridArea* / gridAuto* → per-key message
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Satori does not support CSS grid (Pitfall 15) — ban display:grid and grid* props in OG sources',
      recommended: true,
    },
    schema: [],
    messages: {
      displayGrid: "Satori does not support display:'grid' — use flexbox.",
      gridProp: "Satori does not support '{{key}}' — use flexbox.",
    },
  },
  create(context) {
    return {
      Property(node) {
        // Resolve the key whether it is an Identifier (`display`) or a string
        // literal (`'display'`).
        const key = node.key && (node.key.name ?? node.key.value);
        const val = node.value && node.value.value;

        if (key === 'display' && val === 'grid') {
          context.report({ node, messageId: 'displayGrid' });
        }

        if (typeof key === 'string' && /^grid(Template|Column|Row|Area|Auto)/.test(key)) {
          context.report({ node, messageId: 'gridProp', data: { key } });
        }
      },
    };
  },
};
