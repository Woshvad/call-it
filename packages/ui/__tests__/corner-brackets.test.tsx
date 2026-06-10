/**
 * CornerBrackets test
 * Tests the 4 absolutely-positioned spans with correct border classes.
 *
 * Phase 09.2 retheme (D-15 lockstep update): prototype `.bracketed` recipe —
 * 14px L-shaped 1px var(--border-active) corner marks (was 16px 4px accent).
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

  it('top-left span has border-t and border-l (1px L-mark)', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const topLeft = spans[0];
    expect(topLeft?.className).toContain('border-t');
    expect(topLeft?.className).toContain('border-l');
  });

  it('top-right span has border-t and border-r', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const topRight = spans[1];
    expect(topRight?.className).toContain('border-t');
    expect(topRight?.className).toContain('border-r');
  });

  it('bottom-left span has border-b and border-l', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const bottomLeft = spans[2];
    expect(bottomLeft?.className).toContain('border-b');
    expect(bottomLeft?.className).toContain('border-l');
  });

  it('bottom-right span has border-b and border-r', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    const bottomRight = spans[3];
    expect(bottomRight?.className).toContain('border-b');
    expect(bottomRight?.className).toContain('border-r');
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

  it('all spans are 14px var(--border-active) marks (.bracketed recipe)', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <CornerBrackets />
      </div>
    );
    const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    for (const span of spans) {
      expect(span.className).toContain('w-[14px]');
      expect(span.className).toContain('h-[14px]');
      expect(span.className).toContain('border-[var(--border-active)]');
    }
  });
});
