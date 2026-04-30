/**
 * Privacy `/privacy` — DPDP-compliant placeholder.
 *
 * Panel-locked stub (Vinod Patel + Tanvi Bhatia, 2026-04-30):
 *   - The marketing site MUST not link to dead /privacy. Vinod blocked
 *     /pricing rollout until this page returns a valid response.
 *   - Content is honest about current state: no analytics, no trackers,
 *     OTP login only. As features that collect more data ship,
 *     this page expands with them.
 *   - WhatsApp the founder for any privacy question — same channel
 *     used elsewhere on the site. No separate dpo@ email yet.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30: Vinod hard-block resolved by stub)
 */

import { Nav } from '../_components/Nav';
import { Footer } from '../_components/Footer';

export default function PrivacyPage() {
  return (
    <div className="page">
      <Nav />

      <main>
        <section className="legal-hero">
          <div className="wrap">
            <div className="eyebrow">Last updated 2026-04-30</div>
            <h1 className="legal-h1">Privacy.</h1>
          </div>
        </section>

        <section className="legal-body">
          <div className="wrap">
            <article className="legal-prose">
              <p>
                Axhy is operated by a solo founder in Hyderabad, India. This page describes what
                personal data the marketing site and the product collect today. As features that
                collect more data ship, this page is updated alongside them.
              </p>

              <h2>What this marketing site collects</h2>
              <p>
                Nothing. There are no analytics scripts, no third-party trackers, and no cookies on
                axhy.app. The site is a static set of pages. Loading it does not transmit any
                personal data to us or to anyone else.
              </p>

              <h2>What the product collects when you sign up</h2>
              <p>When you log in to use Axhy, we store:</p>
              <ul>
                <li>
                  <strong>Phone number</strong> — to send a one-time password (OTP) and identify
                  your account.
                </li>
                <li>
                  <strong>OTP code</strong> — a short-lived hashed token, stored for at most five
                  minutes, then deleted.
                </li>
                <li>
                  <strong>Session token</strong> — a signed identifier on your device that keeps you
                  logged in. Expires automatically.
                </li>
                <li>
                  <strong>Operational data you create</strong> — sites, workers, visits, photos, and
                  voice notes you record while using Axhy. This data belongs to your company.
                </li>
              </ul>

              <h2>Service providers we use</h2>
              <p>
                Axhy is built on a small set of third-party services. Each one receives only the
                data it needs to do its job:
              </p>
              <ul>
                <li>
                  <strong>Anthropic (Claude API)</strong> — voice transcripts and operational text
                  are sent to Claude for AI verification and the conversational onboarding surface.
                  Responses are returned to your account and stored alongside your data.
                </li>
                <li>
                  <strong>OpenAI</strong> — configured as a fallback model provider per our
                  per-surface model policy. Currently routes a small share of AI calls when the
                  primary provider is unavailable. Same data shapes as above.
                </li>
                <li>
                  <strong>Cohere</strong> — multilingual embeddings for semantic search across your
                  operational notes. Uses India-region availability where the provider exposes it.
                </li>
                <li>
                  <strong>Railway</strong> — managed Postgres database. All operational data (sites,
                  workers, visits, voice transcripts, photos metadata) is stored here.
                </li>
                <li>
                  <strong>Cloudflare R2</strong> — file storage for voice recordings and photo
                  evidence captured by your supervisors and workers.
                </li>
                <li>
                  <strong>MSG91</strong> — SMS OTP delivery. Receives your phone number for the
                  duration of the OTP send, nothing else.
                </li>
              </ul>

              <h2>Where data lives</h2>
              <p>
                Our Postgres database is currently hosted by Railway in San Francisco, United
                States. We have not yet provisioned an India-region database; this is a known gap
                that we will address before scaling beyond the pilot cohort. Cohere embeddings are
                generated in the closest available region to India. Voice and photo files in
                Cloudflare R2 are stored in the provider&apos;s globally replicated network. We will
                update this section when database region changes.
              </p>

              <h2>Your rights under DPDP and IT Rules</h2>
              <p>
                You have the right to access, correct, and delete your data. While Axhy is in pilot,
                the founder handles these requests directly. Message on WhatsApp from the{' '}
                <a href="/contact" className="legal-link">
                  contact page
                </a>{' '}
                and ask. Response within one working day.
              </p>

              <h2>Changes</h2>
              <p>
                When this page changes, the &ldquo;Last updated&rdquo; date at the top changes with
                it. If you have signed up, we will tell you about material changes by WhatsApp
                before they take effect.
              </p>
            </article>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
