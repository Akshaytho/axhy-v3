/**
 * Pricing `/pricing` — Direction A panel-corrected from Claude Design output.
 *
 * Source design: claude.ai/design — TmrynxzoHw_sU0MFNxvWvw — pricing.html.
 *
 * Panel corrections applied 2026-04-30 (vs Claude Design's raw output):
 *   - Eyebrow: 'Pilot · NET 30' → '30-day free pilot'
 *     (Naina: NET 30 conflated pilot phase with post-pilot invoicing.
 *      Rohan: gold eyebrow next to gold ₹8 price diluted hierarchy.)
 *   - Sub copy: 'From ₹2,000 / month base.' → 'Minimum ₹2,000/month.'
 *     (Tanvi: 'base' is jargon — owners read 'base' as 'tier'.)
 *   - Bullet #4: '— never line-itemed.' → '— never billed separately.'
 *     (Tanvi: 'line-itemed' is enterprise-software vocabulary.)
 *   - Trust strip: rewritten to Karthik's invitation copy. Original two
 *     pricing claims (₹10/visit, per-supervisor) were never panel-locked
 *     and are demoted to a 'talk to founder for edge cases' line.
 *   - Footer: reuses shared Footer component — drops Claude Design's
 *     extra 'How it works' / 'DPDP' links (those routes don't exist).
 *   - Variants: baked variant B (gold glow) + 'inline' price layout per
 *     founder hint in §G iteration #2 brief — Claude Design's `?v=` /
 *     `?p=` querystring toggle script removed.
 *   - WhatsApp button uses shared <WhatsAppButton/> with env-var number,
 *     not the hardcoded 919999999999 placeholder.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30 — pricing critique consensus 11/12)
 */

import { Nav } from '../_components/Nav';
import { Footer } from '../_components/Footer';
import { WhatsAppButton } from '../_components/WhatsAppButton';

export default function PricingPage() {
  return (
    <div className="page">
      <Nav active="pricing" />

      <main>
        <section className="pricing-hero">
          <div className="wrap">
            <h1 className="pricing-h1">Simple pricing.</h1>
            <p className="pricing-sub">One plan. Pay only when work happens.</p>
          </div>
        </section>

        <section className="price-wrap">
          <div className="wrap pricing-center">
            <article className="price-card price-card-glow">
              <div className="price-eyebrow">30-day free pilot</div>

              <div className="price-line">
                <span className="price-amt">
                  <span className="price-currency">₹</span>8
                </span>
                <span className="price-unit">per visit completed</span>
              </div>

              <p className="price-sub">
                Minimum <span className="mono price-floor">₹2,000</span>/month. AI included. No
                per-user fees.
              </p>

              <ul className="price-bullets">
                <li>
                  <CheckIcon />
                  <span>
                    <strong>30-day free pilot.</strong> Founder works with you to set up. No card
                    required.
                  </span>
                </li>
                <li>
                  <CheckIcon />
                  <span>NET 30 invoicing after pilot. No auto-billing surprises.</span>
                </li>
                <li>
                  <CheckIcon />
                  <span>Unlimited workers, supervisors, sites.</span>
                </li>
                <li>
                  <CheckIcon />
                  <span>AI cost included — never billed separately.</span>
                </li>
                <li>
                  <CheckIcon />
                  <span>Cancel any time. Your data stays yours.</span>
                </li>
              </ul>

              <div className="price-cta">
                <WhatsAppButton label="Start your 30-day pilot" className="btn-block" />
              </div>
              <p className="price-fine">No card · No auto-billing · Setup with founder</p>
            </article>
          </div>
        </section>

        <section className="trust-wrap">
          <div className="wrap">
            <p className="trust-strip">
              For long-duration tasks or large operations (200+ workers), talk to founder on
              WhatsApp.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="price-check"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}
