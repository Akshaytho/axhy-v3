/**
 * Homepage `/` — Direction A from Claude Design output, panel-corrected.
 *
 * Source design: claude.ai/design — TmrynxzoHw_sU0MFNxvWvw — index.html.
 *
 * Panel corrections applied (vs Claude Design's raw output):
 *   - Hero subhead: pricing mention RESTORED ("Starting at ₹8,000/month.
 *     Free 30-day pilot.") per Naina + Vishal + Kavita.
 *   - Built-for cell #3: 'Phone-first, low-bandwidth in basements' →
 *     'Works on the cheapest Android' (Aanya: false v3.0 promise).
 *   - Voice card tag: '5 visits · verified' → '5 visits · processed'
 *     (Aanya: original overstated AI speed).
 *   - Direction B (centered keystrip) deferred — A wins 5-2.
 *   - Hero headline: kept Claude Design's "Run your floor by voice, not
 *     by typing." (Megha + Karthik R + Shalini lean new; rationale: more
 *     active and product-truthful than the locked category statement).
 *     Re-locks the §G iteration #2 headline through this implementation.
 *
 * @derives(ADR-0005)
 * @derives(master-plan §G iteration #2 — re-locked)
 */

import Link from 'next/link';

import { Nav } from './_components/Nav';
import { Footer } from './_components/Footer';
import { WhatsAppButton } from './_components/WhatsAppButton';
import { VoiceCard } from './_components/VoiceCard';

export default function HomePage() {
  return (
    <div className="page">
      <Nav />

      <main>
        <section className="hero hero-a">
          <div className="wrap">
            <div className="hero-grid">
              <div>
                <h1 className="display">
                  <span className="line">Run your floor</span>
                  <span className="line gold">by voice, not by typing.</span>
                  <span className="line">Built for Indian cleaning.</span>
                </h1>
                <p className="hero-sub">
                  Your supervisors speak in Telugu, Hindi, or English between visits. Axhy listens,
                  verifies the work, and remembers how your company actually runs. Starting at
                  ₹8,000/month. Free 30-day pilot.
                </p>
                <div className="hero-cta">
                  <WhatsAppButton label="Talk to founder on WhatsApp" />
                  <Link className="btn btn-secondary btn-lg" href="/pricing">
                    See pricing
                  </Link>
                </div>
              </div>
              <VoiceCard />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="features">
              <article className="feature">
                <div className="feature-num">01 / Capture</div>
                <h3>Voice-first capture.</h3>
                <p>
                  Supervisors record what they see, in the language they speak. No forms, no typing,
                  no app training week.
                </p>
              </article>
              <article className="feature">
                <div className="feature-num">02 / Verify</div>
                <h3>AI verification.</h3>
                <p>
                  Each report gets cross-checked against the visit schedule, prior reports, and site
                  context — before it ever hits your inbox.
                </p>
              </article>
              <article className="feature">
                <div className="feature-num">03 / Remember</div>
                <h3>Living context.</h3>
                <p>
                  Axhy learns your sites, supervisors, and quirks. Every week it understands your
                  operations a little better than the last.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.4fr',
                gap: 48,
                alignItems: 'start',
              }}
            >
              <div>
                <div className="eyebrow">Built for Indian cleaning companies</div>
                <h2
                  style={{
                    fontFamily: 'var(--display)',
                    fontWeight: 800,
                    fontSize: 'clamp(28px, 3.6vw, 40px)',
                    letterSpacing: '-0.025em',
                    lineHeight: 1.1,
                    marginTop: 14,
                    textWrap: 'balance',
                  }}
                >
                  Software that speaks the language of the floor.
                </h2>
              </div>
              <div className="built-grid">
                <div className="built-cell">
                  <span className="built-num">01</span>
                  <div className="built-text">
                    <strong>Telugu, Hindi, English.</strong>
                    <span>
                      Mixed in one sentence — captured cleanly, the way your team actually talks.
                    </span>
                  </div>
                </div>
                <div className="built-cell">
                  <span className="built-num">02</span>
                  <div className="built-text">
                    <strong>30 to 500 workers.</strong>
                    <span>
                      Designed for the size of operation where Excel breaks but Salesforce is
                      overkill.
                    </span>
                  </div>
                </div>
                <div className="built-cell">
                  <span className="built-num">03</span>
                  <div className="built-text">
                    <strong>Works on the cheapest Android.</strong>
                    <span>Phone-first, lightweight. No tablet purchases, no extra hardware.</span>
                  </div>
                </div>
                <div className="built-cell">
                  <span className="built-num">04</span>
                  <div className="built-text">
                    <strong>NET 30 invoicing.</strong>
                    <span>
                      No card on file. No auto-debits. The way Indian B2B has paid for software for
                      thirty years.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="wrap">
            <h2>Ready to see it?</h2>
            <p>
              30-min WhatsApp call with the founder. No deck. We open Axhy on your real operation.
            </p>
            <WhatsAppButton label="Start a conversation" />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
