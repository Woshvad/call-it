'use client';

import type { ReactNode } from 'react';

/**
 * Layout for the /new page — nested layout with page title.
 * Minimal wrapper; the page itself handles the 2-column layout.
 */
export default function NewCallLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm font-mono text-brand-muted">
          <span>Home</span>
          <span className="mx-2">/</span>
          <span className="text-brand-accent">New Call</span>
        </nav>
        {children}
      </div>
    </div>
  );
}
