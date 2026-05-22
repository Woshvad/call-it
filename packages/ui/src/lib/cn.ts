/**
 * cn() — Tailwind class merge utility
 * Combines clsx (conditional class logic) with tailwind-merge (deduplication).
 * The standard CVA companion for all @call-it/ui components.
 */
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
