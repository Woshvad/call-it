import './globals.css';
import type { Metadata } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import { ClientProviders } from './ClientProviders';
// AppShell is the app chrome (ticker flag + 64px header + 240px sidebar, D-10).
// It mounts NotificationBell + the wallet pill, so it lives INSIDE
// ClientProviders — Providers.tsx itself is never edited (AST-locked).
import { AppShell } from './components/AppShell';

// Brand fonts via next/font (D-04). Weight contract from 09.2-UI-SPEC:
// Archivo only 700/800/900, Inter only 400/500/600, JBM only 500/600/700.
// OG images keep Syne/SpaceGrotesk TTFs in app/fonts/ — untouched this phase.
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-archivo',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
});
const jbm = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-jetbrains-mono',
});

// Force dynamic rendering — Providers are client-only (no SSR), so SSG is not compatible.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Canonical production domain (callitlive.app); override via NEXT_PUBLIC_OG_BASE_URL.
  // Resolves the relative '/api/og/fallback' image path to an absolute URL.
  metadataBase: new URL(process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? 'https://callitlive.app'),
  title: 'Call It — Be right in public',
  description:
    'Social prediction for crypto-native users. Stake USDC on calls, build your permanent onchain reputation.',
  openGraph: {
    title: 'Call It',
    description: 'Every call is permanent, public, and tied to identity.',
    type: 'website',
    images: [{ url: '/api/og/fallback', width: 1200, height: 630, alt: 'Call It' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Call It',
    description: 'Every call is permanent, public, and tied to identity.',
    images: ['/api/og/fallback'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${jbm.variable}`}>
      {/* body styles live in globals.css html,body rule (prototype token layer) */}
      <body>
        <ClientProviders>
          <AppShell>{children}</AppShell>
        </ClientProviders>
      </body>
    </html>
  );
}
