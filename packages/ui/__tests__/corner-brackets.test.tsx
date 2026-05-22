/**
 * CornerBrackets test — RED phase
 * Tests the 4 absolutely-positioned spans with correct border classes
 * Visual parity with apps/web/lib/og-fallback-render.ts cornerBracket()
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CornerBrackets } from '../src/primitives/CornerBrackets';

describe('CornerBrackets component', () => {
  it('renders exactly 4 aria-hidden spans', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = container.querySelectorAll('span[aria-hidden="true"]');
    expect(spans).toHaveLength(4);
  });

  it('top-left span has border-t-4 and border-l-4', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const topLeft = spans[0];
    expect(topLeft?.className).toContain('border-t-4');
    expect(topLeft?.className).toContain('border-l-4');
  });

  it('top-right span has border-t-4 and border-r-4', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const topRight = spans[1];
    expect(topRight?.className).toContain('border-t-4');
    expect(topRight?.className).toContain('border-r-4');
  });

  it('bottom-left span has border-b-4 and border-l-4', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const bottomLeft = spans[2];
    expect(bottomLeft?.className).toContain('border-b-4');
    expect(bottomLeft?.className).toContain('border-l-4');
  });

  it('bottom-right span has border-b-4 and border-r-4', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const bottomRight = spans[3];
    expect(bottomRight?.className).toContain('border-b-4');
    expect(bottomRight?.className).toContain('border-r-4');
  });

  it('all spans are absolutely positioned', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    for (const span of spans) {
      expect(span.className).toContain('absolute');
    }
  });

  it('all spans have brand-accent border color', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    for (const span of spans) {
      expect(span.className).toContain('border-brand-accent');
    }
  });
});
