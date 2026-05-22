/**
 * Onboarding layout — wraps all onboarding steps with a progress indicator.
 *
 * Renders a 5-dot progress bar at the top of the screen showing the current
 * step (handle → socials → follow-graph → fund → tagline), with the current
 * step highlighted in brand-accent (#E8F542).
 *
 * AUTH-44: No wallet address rendered here — handle-only in all onboarding screens.
 *
 * Requirements: AUTH-19, AUTH-20, UI-25
 */

'use client';

import { usePathname } from 'next/navigation';
import { Card } from '@call-it/ui';

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

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: '100vh',
        padding: '2rem 1rem',
        backgroundColor: '#09090E',
        gap: '1.5rem',
      }}
    >
      {/* Brand mark */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            color: '#E8F542',
            fontFamily: "'Syne', sans-serif",
            textTransform: 'uppercase',
            lineHeight: 1,
            margin: 0,
          }}
        >
          CALL IT
        </h1>
      </div>

      {/* Step progress indicator — 5 dots */}
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
                ? '#E8F542'
                : i < currentIndex
                  ? '#52525B'
                  : '#27272A',
              border: '2px solid',
              borderColor: i === currentIndex ? '#E8F542' : '#3F3F46',
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
          maxWidth: '480px',
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
