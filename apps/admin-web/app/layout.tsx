/**
 * Root layout — wires Inter (body+display) and JetBrains Mono fonts to the
 * CSS variables consumed by globals.css.
 *
 * @derives(ADR-0005)
 */

import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://axhy.app'),
  title: {
    default: 'Axhy — Voice-first ops for Indian cleaning companies',
    template: '%s · Axhy',
  },
  description:
    'Run your floor by voice, not by typing. Voice-first AI-verified facility management software for Indian cleaning companies. Starting at ₹8,000/month. Free 30-day pilot.',
  applicationName: 'Axhy',
  generator: 'Next.js',
  keywords: [
    'cleaning software India',
    'facility management software',
    'voice-first operations',
    'cleaning workforce app',
    'audit trail cleaning',
    'B2B cleaning SaaS',
    'Indian cleaning company',
    'Hyderabad SaaS',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://axhy.app',
    siteName: 'Axhy',
    title: 'Axhy — Voice-first ops for Indian cleaning companies',
    description: 'Run your floor by voice, not by typing.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Axhy — Voice-first ops for Indian cleaning companies',
    description: 'Run your floor by voice, not by typing.',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://axhy.app' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
