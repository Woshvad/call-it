'use client';

import { useState } from 'react';
import { Controller, type Control } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { CATEGORIES } from '@call-it/shared';
import { Card } from '@call-it/ui';

interface AdvancedSettingsProps {
  control: Control<CreateCallInput>;
}

const CATEGORY_LABELS: Record<string, string> = {
  majors: 'Majors (BTC, ETH, etc.)',
  defi: 'DeFi Protocols',
  other: 'Other',
};

export function AdvancedSettings({ control }: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setIsOpen((o) => !o)} className="flex items-center gap-2 text-sm font-mono text-brand-muted hover:text-brand-text" aria-expanded={isOpen}>
        <span className="text-brand-accent">{isOpen ? '▼' : '▶'}</span>
        Advanced Settings
      </button>
      {isOpen && (
        <Card className="mt-3 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-mono text-brand-text">Open to Challenges</div>
              <div className="text-xs font-mono text-brand-muted">Allow 1v1 challenges (CALL-64)</div>
            </div>
            <Controller name="openToChallenges" control={control} render={({ field }) => (
              <button type="button" onClick={() => field.onChange(!field.value)} className={['w-12 h-6 border-2 relative', field.value ? 'bg-brand-accent border-brand-accent' : 'bg-brand-surface border-brand-border'].join(' ')} aria-checked={field.value} role="switch">
                <span className={['absolute top-0.5 h-4 w-4 border-2 border-brand-bg', field.value ? 'translate-x-6 bg-brand-bg' : 'translate-x-0.5 bg-brand-border'].join(' ')} />
              </button>
            )} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-mono text-brand-text">Category</label>
            <Controller name="category" control={control} render={({ field }) => (
              <select value={field.value ?? 'majors'} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} className="border-2 bg-brand-surface text-brand-text font-mono px-3 py-2 border-brand-border">
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>)}
              </select>
            )} />
          </div>
          <div className="flex items-center justify-between opacity-50">
            <div>
              <div className="text-sm font-mono text-brand-text">Auto-post to X</div>
              <div className="text-xs font-mono text-brand-muted">Coming in Phase 7</div>
            </div>
            <div className="w-12 h-6 bg-brand-accent border-2 border-brand-accent relative cursor-not-allowed">
              <span className="absolute top-0.5 left-6 h-4 w-4 border-2 border-brand-bg bg-brand-bg" />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
