/**
 * Supervisor preview — root layout.
 *
 * @derives(master-plan §G)
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono, Noto_Sans_Devanagari, Noto_Sans_Telugu } from 'next/font/google';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-jetbrains-mono',
});
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-devanagari',
});
const notoTelugu = Noto_Sans_Telugu({
  subsets: ['telugu'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-telugu',
});

/** @derives(master-plan §G) */
export const metadata: Metadata = {
  title: 'Supervisor preview · Axhy',
  description: 'Internal preview of the supervisor mobile app for founder evaluation.',
  robots: 'noindex, nofollow',
};

/** @derives(master-plan §G) */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} ${notoDevanagari.variable} ${notoTelugu.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
