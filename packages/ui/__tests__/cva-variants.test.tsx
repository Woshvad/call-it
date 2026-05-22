/**
 * CVA Variants test — RED phase
 * Tests Button intent × size combos (3×3 = 9 combinations)
 * Plus Card and Tag variant rendering.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Button } from '../src/primitives/Button';
import { Card } from '../src/primitives/Card';
import { Tag } from '../src/primitives/Tag';

describe('Button CVA variants', () => {
  it('renders primary md button with accent bg', () => {
    const { container } = render(<Button intent="primary" size="md">Click</Button>);
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.className).toContain('bg-brand-accent');
    expect(btn?.className).toContain('text-black');
  });

  it('renders primary sm button', () => {
    const { container } = render(<Button intent="primary" size="sm">Small</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-brand-accent');
    expect(btn?.className).toContain('text-xs');
  });

  it('renders primary lg button', () => {
    const { container } = render(<Button intent="primary" size="lg">Large</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-brand-accent');
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

  it('renders danger md button', () => {
    const { container } = render(<Button intent="danger" size="md">Danger</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-outcome-loss');
  });

  it('renders danger sm button', () => {
    const { container } = render(<Button intent="danger" size="sm">Danger Sm</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-outcome-loss');
  });

  it('renders danger lg button', () => {
    const { container } = render(<Button intent="danger" size="lg">Danger Lg</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-outcome-loss');
  });

  it('has hard offset shadow on primary button', () => {
    const { container } = render(<Button intent="primary">Shadow</Button>);
    const btn = container.querySelector('button');
    // CVA base classes include shadow-[4px_4px_0_0_#000]
    expect(btn?.className).toContain('shadow-[4px_4px_0_0_#000]');
  });

  it('renders with default intent=primary and size=md when no props', () => {
    const { container } = render(<Button>Default</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-brand-accent');
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
});
