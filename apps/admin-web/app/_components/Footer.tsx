/**
 * Site footer — pixel-matches Claude Design index.html.
 *
 * Phone number from validated env config (no fallback — fails at boot if
 * NEXT_PUBLIC_AXHY_WHATSAPP is missing, per Iteration 4 quality rule).
 *
 * @derives(ADR-0005)
 */

import Link from 'next/link';

import { env } from '../../lib/env';

import { Logo } from './Logo';

const WA_NUMBER = env.NEXT_PUBLIC_AXHY_WHATSAPP;

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo withWordmark />
            <p className="footer-tag">
              Voice-first operations for Indian cleaning companies. Built in Hyderabad.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li>
                <Link href="/pricing">Pricing</Link>
              </li>
              <li>
                <Link href="/login">Log in</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
              <li>
                <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} Axhy · Hyderabad, India</span>
          <span className="mono">v 1.0.0</span>
        </div>
      </div>
    </footer>
  );
}
