/**
 * Receipt AUTH-44 invariant test — RED phase
 *
 * Static-source assertions that Receipt.tsx NEVER:
 *   - references data.address in JSX
 *   - contains a hardcoded 0x... wallet address literal
 *   - uses display:grid or grid-cols-* Tailwind utilities (Pitfall 15)
 *
 * Also renders the component and asserts no 0x... string appears in the DOM.
 *
 * This test is a permanent anti-drift defense: if any PR accidentally
 * introduces address exposure or grid layout, this test fails immediately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';
import React from 'react';
import { Receipt } from '../src/compound/Receipt';

const RECEIPT_PATH = join(process.cwd(), 'src/compound/Receipt.tsx');

describe('Receipt AUTH-44: no wallet address in source', () => {
  let source: string;

  it('can read the Receipt source file', () => {
    source = readFileSync(RECEIPT_PATH, 'utf-8');
    expect(source.length).toBeGreaterThan(100);
  });

  it('source does NOT contain data.address', () => {
    source = readFileSync(RECEIPT_PATH, 'utf-8');
    expect(source).not.toContain('data.address');
  });

  it('source does NOT contain a hardcoded 0x... wallet address literal', () => {
    source = readFileSync(RECEIPT_PATH, 'utf-8');
    expect(source).not.toMatch(/0x[a-fA-F0-9]{40}/);
  });

  it('source does NOT use display: grid (Pitfall 15)', () => {
    source = readFileSync(RECEIPT_PATH, 'utf-8');
    expect(source).not.toContain("display: 'grid'");
    expect(source).not.toContain('display: "grid"');
    expect(source).not.toContain("display:'grid'");
  });

  it('source does NOT use Tailwind grid-cols-* classes (Pitfall 15)', () => {
    source = readFileSync(RECEIPT_PATH, 'utf-8');
    expect(source).not.toMatch(/className=["'][^"']*grid-cols/);
    expect(source).not.toMatch(/grid-cols-\d/);
  });

  it('has FLEXBOX ONLY file-header comment (Pitfall 15 anti-drift)', () => {
    source = readFileSync(RECEIPT_PATH, 'utf-8');
    expect(source).toContain('FLEXBOX ONLY');
    expect(source).toContain('Pitfall 15');
  });
});

describe('Receipt AUTH-44: no wallet address in rendered DOM', () => {
  it('rendered component does not contain any 0x hex address string', () => {
    const { container } = render(
      <Receipt
        mode="settled"
        data={{
          handle: 'veda',
          marketLine: 'BTC >= $80k',
          conviction: 90,
          deadline: new Date(Date.now() + 86400000),
          stake: 100,
          outcome: 'CALLED IT',
          outcomeColor: 'outcome-win',
        }}
      />
    );
    // The full rendered text should not contain a 0x hex address
    const fullText = container.textContent ?? '';
    expect(fullText).not.toMatch(/0x[a-fA-F0-9]{20,}/);
  });

  it('rendered preview mode does not expose address', () => {
    const { container } = render(
      <Receipt
        mode="preview"
        data={{
          handle: 'trader',
          marketLine: 'ETH >= $5k',
          conviction: 60,
          deadline: new Date(Date.now() + 86400000),
          stake: 50,
        }}
      />
    );
    const fullText = container.textContent ?? '';
    expect(fullText).not.toMatch(/0x[a-fA-F0-9]{20,}/);
  });
});
