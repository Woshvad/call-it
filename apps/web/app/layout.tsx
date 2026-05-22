import type { Metadata } from 'next';
import { Providers } from './Providers';

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
