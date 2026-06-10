/**
 * CVA Variants test
 * Tests Button intent × size combos plus Card and Tag variant rendering.
 *
 * Phase 09.2 retheme (D-15 lockstep update):
 *   primary   → .btn.cream recipe (cream bg, black text, press physics)
 *   secondary → .btn.outline-white (transparent, white text)
 *   danger    → loss-styled outline (transparent, --accent-loss border/text)
 * The accent chartreuse is NEVER a button background (UI-SPEC).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Button } from '../src/primitives/Button';
import { Card } from '../src/primitives/Card';
import { Tag } from '../src/primitives/Tag';

describe('Button CVA variants', () => {
  it('renders primary md button with cream bg (the .btn.cream signature CTA)', () => {
    const { container } = render(<Button intent="primary" size="md">Click</Button>);
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.className).toContain('bg-brand-cream');
    expect(btn?.className).toContain('text-black');
  });

  it('renders primary sm button', () => {
    const { container } = render(<Button intent="primary" size="sm">Small</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-brand-cream');
    expect(btn?.className).toContain('text-xs');
  });

  it('renders primary lg button', () => {
    const { container } = render(<Button intent="primary" size="lg">Large</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-brand-cream');
    expect(btn?.className).toContain('text-lg');
  });

  it('renders secondary md button', () => {
    const { container } = render(<Button intent="secondary" size="md">Secondary</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-transparent');
    expect(btn?.className).toContain('text-white');
  });

  it('renders secondary sm button', () => {
    const { container } = render(<Button intent="secondary" size="sm">Secondary Sm</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-transparent');
  });

  it('renders secondary lg button', () => {
    const { container } = render(<Button intent="secondary" size="lg">Secondary Lg</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-transparent');
  });

  it('renders danger md button (loss outline — never a solid loss bg)', () => {
    const { container } = render(<Button intent="danger" size="md">Danger</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('border-outcome-loss');
    expect(btn?.className).toContain('text-outcome-loss');
  });

  it('renders danger sm button', () => {
    const { container } = render(<Button intent="danger" size="sm">Danger Sm</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('border-outcome-loss');
  });

  it('renders danger lg button', () => {
    const { container } = render(<Button intent="danger" size="lg">Danger Lg</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('border-outcome-loss');
  });

  it('has hard offset shadow on primary button', () => {
    const { container } = render(<Button intent="primary">Shadow</Button>);
    const btn = container.querySelector('button');
    // Cream recipe carries the brutal black shadow
    expect(btn?.className).toContain('shadow-[4px_4px_0_0_#000]');
  });

  it('primary button has the cream press physics (down-right, shadow collapse)', () => {
    const { container } = render(<Button intent="primary">Press</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('hover:translate-x-[2px]');
    expect(btn?.className).toContain('hover:translate-y-[2px]');
    expect(btn?.className).toContain('active:translate-x-[4px]');
    expect(btn?.className).toContain('active:shadow-none');
  });

  it('renders with default intent=primary and size=md when no props', () => {
    const { container } = render(<Button>Default</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-brand-cream');
  });

  it('renders all 8 intent keys without error', () => {
    const intents = [
      'primary',
      'secondary',
      'danger',
      'cream',
      'fade',
      'duel',
      'outline-white',
      'ghost',
    ] as const;
    for (const intent of intents) {
      const { container } = render(<Button intent={intent}>{intent}</Button>);
      expect(container.querySelector('button')).toBeTruthy();
    }
  });

  it('cream intent matches the primary recipe (alias)', () => {
    const { container: a } = render(<Button intent="cream">A</Button>);
    const { container: b } = render(<Button intent="primary">B</Button>);
    expect(a.querySelector('button')?.className).toBe(b.querySelector('button')?.className);
  });

  it('duel intent carries the duel identity color (#A855F7)', () => {
    const { container } = render(<Button intent="duel">Duel</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('#A855F7');
  });
});

describe('Card component', () => {
  it('renders children inside a card wrapper', () => {
    render(<Card>Hello Card</Card>);
    expect(screen.getByText('Hello Card')).toBeTruthy();
  });

  it('applies border and shadow base classes', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card?.className).toContain('border');
  });

  it('accent prop renders an accent border (the accent shadow is gone)', () => {
    const { container } = render(<Card accent>Accent</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card?.className).toContain('border-[var(--border-accent)]');
    expect(card?.className).not.toContain('E8F542');
  });

  it('renders heavy / hero / cream / interactive variants', () => {
    const variants = ['heavy', 'hero', 'cream', 'interactive'] as const;
    for (const variant of variants) {
      const { container } = render(<Card variant={variant}>{variant}</Card>);
      expect(container.firstChild).toBeTruthy();
    }
  });
});

describe('Tag component', () => {
  it('renders info tag', () => {
    render(<Tag intent="info">Info</Tag>);
    expect(screen.getByText('Info')).toBeTruthy();
  });

  it('renders success tag', () => {
    const { container } = render(<Tag intent="success">Win</Tag>);
    const tag = container.firstChild as HTMLElement;
    expect(tag?.className).toContain('border-outcome-win');
  });

  it('renders warning tag', () => {
    const { container } = render(<Tag intent="warning">Warn</Tag>);
    const tag = container.firstChild as HTMLElement;
    expect(tag?.className).toContain('border-brand-accent');
  });

  it('renders danger tag', () => {
    const { container } = render(<Tag intent="danger">Danger</Tag>);
    const tag = container.firstChild as HTMLElement;
    expect(tag?.className).toContain('border-outcome-loss');
  });

  it('carries the .pill recipe — JBM uppercase inline-flex, never grid', () => {
    const { container } = render(<Tag intent="info">Pill</Tag>);
    const tag = container.firstChild as HTMLElement;
    expect(tag?.className).toContain('font-mono');
    expect(tag?.className).toContain('uppercase');
    expect(tag?.className).toContain('inline-flex');
    expect(tag?.className).not.toContain('grid');
  });
});
