/**
 * Supervisor preview — root layout.
 *
 * @derives(master-plan §G)
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-body',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-mono',
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
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
