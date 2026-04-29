/**
 * Contact `/contact` — Direction A panel-corrected from Claude Design output.
 *
 * Source design: claude.ai/design — TmrynxzoHw_sU0MFNxvWvw — contact.html.
 *
 * Panel corrections applied 2026-04-30 (vs Claude Design's raw output):
 *   - 4-channel layout (WhatsApp / Demo a pilot / Email / In person) accepted
 *     even though original brief locked 3 channels. 'Demo a pilot' is a
 *     prefilled WhatsApp deep-link, not a form, so Tanvi's no-forms rule
 *     holds. Karthik approved softer second WhatsApp ramp.
 *   - Hero copy: kept design's `Talk to us.` (warmer than brief's `Reach us.`)
 *     plus the lede `Four ways to reach Axhy, in the order we actually
 *     answer them.`
 *   - WhatsApp #1 uses primary gold button; Demo #2 uses secondary outline
 *     button — visual hierarchy keeps WhatsApp dominant (Megha).
 *   - All buttons use shared <WhatsAppButton/> with env-var number; mailto
 *     points to hello@axhy.app (founder confirmed inbox is checked daily).
 *   - Footer reuses shared component — no dead links.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30 — contact critique)
 */

import { Nav } from '../_components/Nav';
import { Footer } from '../_components/Footer';
import { WhatsAppButton } from '../_components/WhatsAppButton';

export default function ContactPage() {
  return (
    <div className="page">
      <Nav active="contact" />

      <main>
        <section className="contact-hero">
          <div className="wrap contact-wrap">
            <h1 className="contact-h1">Talk to us.</h1>
            <p className="contact-lede">
              Four ways to reach Axhy, in the order we actually answer them.
            </p>
          </div>
        </section>

        <section className="wrap">
          <div className="channels">
            <div className="channel">
              <div className="channel-num">01</div>
              <div className="channel-body">
                <div className="channel-title">
                  <h2>WhatsApp</h2>
                  <span className="channel-badge channel-badge-fast">Fastest</span>
                </div>
                <p className="channel-desc">
                  Usually under an hour during work days. Founder replies — not a support queue.
                </p>
              </div>
              <div className="channel-cta">
                <WhatsAppButton label="Message on WhatsApp" size="md" />
              </div>
            </div>

            <div className="channel">
              <div className="channel-num">02</div>
              <div className="channel-body">
                <div className="channel-title">
                  <h2>Demo a pilot</h2>
                  <span className="channel-badge">20 min</span>
                </div>
                <p className="channel-desc">
                  See Axhy run on your real operations. 20-min walkthrough, founder-led. Free, no
                  card.
                </p>
              </div>
              <div className="channel-cta">
                <WhatsAppButton
                  label="Book a 20-min demo"
                  size="md"
                  variant="secondary"
                  prefill="Hi Akshay, I want to see a demo of Axhy."
                />
              </div>
            </div>

            <div className="channel">
              <div className="channel-num">03</div>
              <div className="channel-body">
                <div className="channel-title">
                  <h2>Email</h2>
                </div>
                <p className="channel-desc">
                  For longer notes, attachments, or anything that needs a paper trail.
                </p>
              </div>
              <div className="channel-cta">
                <a className="channel-link" href="mailto:hello@axhy.app">
                  hello@axhy.app →
                </a>
              </div>
            </div>

            <div className="channel channel-no-cta">
              <div className="channel-num">04</div>
              <div className="channel-body">
                <div className="channel-title">
                  <h2>In person</h2>
                </div>
                <p className="channel-desc">
                  Hyderabad, India. Founder-led pilots include an in-person setup visit — we sit
                  with your HR team for an afternoon.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
