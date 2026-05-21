/**
 * ESLint custom rule: no-display-grid
 *
 * Blocks `display: 'grid'` in JSX style attributes on OG template files.
 * Satori does NOT support CSS Grid — layouts silently misrender (Pitfall 15).
 * Use display: flex for all OG card templates.
 *
 * Wave 0: enforced only for files matching apps/web/app/api/og/**
 * Phase 7: full enforcement when all 5 OG variants land.
 *
 * Source: CLAUDE.md "What NOT to Use" → display: grid in OG card templates
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
const noDisplayGrid = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow display: grid in OG template files — Satori does not support CSS Grid (Pitfall 15). Use display: flex.',
      recommended: true,
      url: 'https://github.com/call-it/call-it/blob/main/packages/config/eslint/no-display-grid.js',
    },
    messages: {
      noDisplayGrid:
        'Satori does not support display: grid (Pitfall 15). Use display: flex.',
    },
    schema: [],
  },
  create(context) {
    /**
     * Check an ObjectExpression for { display: 'grid' } or { display: `grid` }.
     * Handles string literals and template literals.
     */
    function checkObjectExpression(node) {
      for (const prop of node.properties) {
        if (prop.type !== 'Property') continue;
        const keyName =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : prop.key.type === 'Literal'
              ? String(prop.key.value)
              : null;
        if (keyName !== 'display') continue;

        const val = prop.value;
        // String literal: 'grid'
        if (val.type === 'Literal' && typeof val.value === 'string' && val.value === 'grid') {
          context.report({ node: prop, messageId: 'noDisplayGrid' });
        }
        // Template literal: `grid`
        if (
          val.type === 'TemplateLiteral' &&
          val.quasis.length === 1 &&
          val.quasis[0].value.cooked === 'grid'
        ) {
          context.report({ node: prop, messageId: 'noDisplayGrid' });
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') return;
        const valueNode = node.value;
        if (!valueNode) return;

        // style={{ display: 'grid' }}
        if (
          valueNode.type === 'JSXExpressionContainer' &&
          valueNode.expression.type === 'ObjectExpression'
        ) {
          checkObjectExpression(valueNode.expression);
        }
      },
    };
  },
};

module.exports = noDisplayGrid;
