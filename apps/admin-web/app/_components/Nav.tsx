/**
 * Sticky top navigation — pixel-matches Claude Design index.html.
 *
 * Mobile menu drawer is unhooked in v1.0 per design caveat. Add when first
 * user reports needing it.
 *
 * @derives(ADR-0005)
 */

import Link from 'next/link';

import { Logo } from './Logo';

type Props = {
  active?: 'pricing' | 'about' | 'contact' | null;
};

export function Nav({ active = null }: Props) {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Logo />
        <nav className="nav-links" aria-label="Primary">
          <Link href="/pricing" className={active === 'pricing' ? 'active' : undefined}>
            Pricing
          </Link>
          <Link href="/about" className={active === 'about' ? 'active' : undefined}>
            About
          </Link>
          <Link href="/contact" className={active === 'contact' ? 'active' : undefined}>
            Contact
          </Link>
        </nav>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/login" className="nav-cta">
            Log in
          </Link>
          <button className="nav-mobile-toggle" aria-label="Open menu" type="button">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
