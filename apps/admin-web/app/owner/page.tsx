/**
 * Owner home `/owner` — neutral 'coming soon' stub.
 *
 * Panel-locked 2026-04-30 (Vinod + Priya + Karthik): /login success redirects
 * here so visitors don't bounce back to the marketing site. Page does NOT
 * claim authentication state — it's reachable by anyone via URL because we
 * haven't yet picked a token-persistence strategy. When that debate lands
 * (separate panel session), this page becomes a real authed dashboard.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30 — Priya 'close the login loop' + Vinod neutrality)
 */

import Link from 'next/link';

import { Nav } from '../_components/Nav';
import { Footer } from '../_components/Footer';
import { WhatsAppButton } from '../_components/WhatsAppButton';

export default function OwnerPage() {
  return (
    <div className="page">
      <Nav />

      <main>
        <section className="legal-hero">
          <div className="wrap">
            <div className="eyebrow">Owner dashboard</div>
            <h1 className="legal-h1">Coming soon.</h1>
          </div>
        </section>

        <section className="legal-body">
          <div className="wrap">
            <article className="legal-prose">
              <p>
                Your owner dashboard isn&apos;t live yet. We&apos;re building it alongside the first
                ten pilot customers so it reflects how you actually run your operations, not what we
                guess from outside.
              </p>

              <p>
                If you&apos;ve already started a pilot, the founder is your dashboard for now —
                everything you&apos;d see here, you can ask for on WhatsApp and get an answer the
                same day.
              </p>

              <p>
                If you signed in to look around, thank you for the curiosity.{' '}
                <Link href="/" className="legal-link">
                  Back to the homepage
                </Link>
                .
              </p>

              <div className="about-cta">
                <WhatsAppButton label="Message the founder" />
                <span className="about-cta-text">Same person, every reply.</span>
              </div>
            </article>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
