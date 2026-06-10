import './globals.css';
import type { Metadata } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import { ClientProviders } from './ClientProviders';
// GlobalNav mounts NotificationBell (authenticated users only — SOCIAL-24, D-13)
import { GlobalNav } from './components/GlobalNav';

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
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${jbm.variable}`}>
      {/* body styles live in globals.css html,body rule (prototype token layer) */}
      <body>
        <ClientProviders>
          <GlobalNav />
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
