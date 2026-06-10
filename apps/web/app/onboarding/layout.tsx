/**
 * Onboarding layout — wraps all onboarding steps with a progress indicator.
 *
 * Renders a 5-dot progress bar at the top of the screen showing the current
 * step (handle → socials → follow-graph → fund → tagline), with the current
 * step highlighted in the accent (var(--accent-win)).
 *
 * 09.2-13 retheme: page-header voice — Archivo brand mark + JBM overline step
 * counter; square accent progress dots. Step order, dot count/testids,
 * completion gates, and redirect logic are UNTOUCHED (D-05/D-14).
 *
 * AUTH-44: No wallet address rendered here — handle-only in all onboarding screens.
 *
 * Requirements: AUTH-19, AUTH-20, UI-25
 */

'use client';

import { usePathname } from 'next/navigation';
import { Card } from '@call-it/ui';
import { useIsMobile } from '../hooks/useIsMobile';

const STEPS = [
  { slug: 'handle', label: 'Handle' },
  { slug: 'socials', label: 'Socials' },
  { slug: 'follow-graph', label: 'Network' },
  { slug: 'fund', label: 'Fund' },
  { slug: 'tagline', label: 'Commit' },
];

function getStepIndex(pathname: string): number {
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    if (step && pathname.includes(`/onboarding/${step.slug}`)) {
      return i;
    }
  }
  return 0;
}

interface OnboardingLayoutProps {
  children: React.ReactNode;
}

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  const pathname = usePathname();
  const currentIndex = getStepIndex(pathname);
  // UI-48: the inner frame is maxWidth:480px + width:100%; the outer main already pads
  // 1rem (16px) each side. At mobile we additionally clamp the frame maxWidth to
  // calc(100vw - 32px) so a 480px frame can never overflow a 375px viewport (the 16px
  // gutter is preserved by the outer padding). The 5 subroutes inherit this frame.
  const isMobile = useIsMobile();

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: '100vh',
        padding: '2rem 1rem',
        backgroundColor: 'var(--bg-primary)',
        gap: '1.5rem',
      }}
    >
      {/* Brand mark — Archivo display voice */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            color: 'var(--accent-win)',
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            lineHeight: 1,
            margin: 0,
          }}
        >
          CALL IT
        </h1>
        {/* JBM overline step counter */}
        <span className="label-overline">
          STEP {currentIndex + 1} / {STEPS.length} // {STEPS[currentIndex]?.label ?? ''}
        </span>
      </div>

      {/* Step progress indicator — 5 dots (square, accent for active) */}
      <div
        style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}
        data-testid="onboarding-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={currentIndex + 1}
        aria-label={`Step ${currentIndex + 1} of ${STEPS.length}: ${STEPS[currentIndex]?.label ?? ''}`}
      >
        {STEPS.map((step, i) => (
          <div
            key={step.slug}
            style={{
              width: i === currentIndex ? '24px' : '10px',
              height: '10px',
              backgroundColor: i === currentIndex
                ? 'var(--accent-win)'
                : i < currentIndex
                  ? 'var(--text-tertiary)'
                  : 'var(--bg-tertiary)',
              border: '2px solid',
              borderColor: i === currentIndex ? 'var(--border-accent)' : 'var(--border-active)',
              transition: 'all 0.2s ease',
            }}
            title={step.label}
            data-testid={`progress-dot-${step.slug}`}
          />
        ))}
      </div>

      {/* Step content */}
      <Card
        style={{
          width: '100%',
          maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          padding: '1.5rem',
        }}
      >
        {children}
      </Card>
    </main>
  );
}
