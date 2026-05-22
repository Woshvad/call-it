/**
 * useToast — programmatic toast API
 *
 * Usage (within ToastProvider):
 *   const { show, dismiss } = useToast();
 *   show({ status: 'success', message: 'Call published!' });
 *   dismiss(id);
 *
 * Context shape is exported for the provider's internal use.
 */
import { useContext, createContext } from 'react';

export type ToastStatus = 'success' | 'info' | 'error';

export interface ToastItem {
  id: string;
  status: ToastStatus;
  message: string;
  duration: number;
  createdAt: number;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  show: (opts: { status: ToastStatus; message: string; duration?: number }) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}
