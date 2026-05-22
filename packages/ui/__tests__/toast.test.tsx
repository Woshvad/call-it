/**
 * Toast + useToast hook test — RED phase
 * Tests: 3-status stacking, auto-dismiss with fake timers, countdown bar CSS animation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '../src/primitives/ToastProvider';
import { useToast } from '../src/hooks/useToast';

// Helper component that calls useToast
function ToastTrigger({ toasts }: { toasts: Array<{ status: 'success' | 'info' | 'error'; message: string }> }) {
  const { show } = useToast();

  React.useEffect(() => {
    for (const t of toasts) {
      show({ status: t.status, message: t.message });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function renderWithProvider(toasts: Array<{ status: 'success' | 'info' | 'error'; message: string }>) {
  return render(
    <ToastProvider>
      <ToastTrigger toasts={toasts} />
    </ToastProvider>
  );
}

describe('Toast stacking behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a single success toast', async () => {
    await act(async () => {
      renderWithProvider([{ status: 'success', message: 'Call published' }]);
    });
    expect(screen.getByText('Call published')).toBeTruthy();
  });

  it('renders 3 stacked toasts simultaneously', async () => {
    await act(async () => {
      renderWithProvider([
        { status: 'success', message: 'Toast 1' },
        { status: 'info', message: 'Toast 2' },
        { status: 'error', message: 'Toast 3' },
      ]);
    });
    expect(screen.getByText('Toast 1')).toBeTruthy();
    expect(screen.getByText('Toast 2')).toBeTruthy();
    expect(screen.getByText('Toast 3')).toBeTruthy();
  });

  it('auto-dismisses toast after 5000ms', async () => {
    await act(async () => {
      renderWithProvider([{ status: 'success', message: 'Auto dismiss me' }]);
    });
    expect(screen.getByText('Auto dismiss me')).toBeTruthy();

    // Advance timers past 5s
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    // Toast should be gone
    expect(screen.queryByText('Auto dismiss me')).toBeNull();
  });

  it('countdown bar element exists on each toast', async () => {
    const { container } = await act(async () => {
      return renderWithProvider([{ status: 'info', message: 'Countdown test' }]);
    });
    // Countdown bar should exist as a child element
    const countdownBar = container.querySelector('[data-countdown]');
    expect(countdownBar).toBeTruthy();
  });
});

describe('Toast status styling', () => {
  it('success toast has outcome-win styling', async () => {
    const { container } = await act(async () => {
      return renderWithProvider([{ status: 'success', message: 'Win!' }]);
    });
    const toastEl = container.querySelector('[data-toast-status="success"]');
    expect(toastEl).toBeTruthy();
  });

  it('info toast has brand-accent styling', async () => {
    const { container } = await act(async () => {
      return renderWithProvider([{ status: 'info', message: 'Info!' }]);
    });
    const toastEl = container.querySelector('[data-toast-status="info"]');
    expect(toastEl).toBeTruthy();
  });

  it('error toast has outcome-loss styling', async () => {
    const { container } = await act(async () => {
      return renderWithProvider([{ status: 'error', message: 'Error!' }]);
    });
    const toastEl = container.querySelector('[data-toast-status="error"]');
    expect(toastEl).toBeTruthy();
  });
});
