import type { Metadata } from 'next';
import { ClientProviders } from './ClientProviders';

// Force dynamic rendering — Providers are client-only (no SSR), so SSG is not compatible.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Call It — Be right in public',
  description:
    'Social prediction for crypto-native users. Stake USDC on calls, build your permanent onchain reputation.',
  openGraph: {
    title: 'Call It',
    description: 'Every call is permanent, public, and tied to identity.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#09090E',
          color: '#FFFFFF',
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100vh',
        }}
      >
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
