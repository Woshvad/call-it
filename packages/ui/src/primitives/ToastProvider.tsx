/**
 * ToastProvider — mount once at the app root (apps/web/app/Providers.tsx in Plan 05)
 *
 * Manages the toast queue state. Children call useToast() to push/pop toasts.
 * Renders Radix Toast Viewport at bottom-right.
 */
'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { useState, useCallback, type ReactNode } from 'react';
import { ToastContext, type ToastItem, type ToastStatus } from '../hooks/useToast';
import { Toast } from './Toast';

const DEFAULT_DURATION = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback(
    (opts: { status: ToastStatus; message: string; duration?: number }): string => {
      const id = crypto.randomUUID();
      const item: ToastItem = {
        id,
        status: opts.status,
        message: opts.message,
        duration: opts.duration ?? DEFAULT_DURATION,
        createdAt: Date.now(),
      };
      setToasts((prev) => [...prev, item]);
      return id;
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}

        {/* Render all active toasts */}
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}

        {/* Radix viewport — bottom-right, stacked */}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 max-w-[400px] outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
