/**
 * About `/about` — Direction A panel-corrected from Claude Design output.
 *
 * Source design: claude.ai/design — TmrynxzoHw_sU0MFNxvWvw — about.html.
 *
 * Panel corrections applied 2026-04-30 (vs Claude Design's raw output):
 *   - Founder card: silhouette SVG + 'placeholder' tag → gold-A monogram
 *     using the existing brand mark. Reads as intentional brand decision,
 *     not 'we couldn't find a photo' (Sara/Rohan/Megha).
 *     Tanvi formally dissented (preferred no card at all); compromised on
 *     the monogram card so the layout stays panel-locked at 'with-photo'.
 *   - Copy: kept Claude Design's rewritten paragraphs (Karthik + Megha
 *     lean new — more credentialed and concrete than the original brief).
 *   - Variants baked: photo=on, quote=edge (gold left border) per
 *     pre-locked founder hint. Canvas-toggle <script> removed.
 *   - WhatsApp button uses shared <WhatsAppButton/> with env-var number.
 *   - Footer reuses shared component — no dead 'How it works' / 'DPDP'
 *     links.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30 — about critique consensus, Tanvi dissent logged)
 */

import { Nav } from '../_components/Nav';
import { Footer } from '../_components/Footer';
import { WhatsAppButton } from '../_components/WhatsAppButton';

export default function AboutPage() {
  return (
    <div className="page">
      <Nav active="about" />

      <main>
        <section className="about-hero">
          <div className="wrap about-wrap">
            <div className="about-meta">Solo founder · Hyderabad</div>
            <h1 className="about-h1">About Axhy.</h1>
          </div>
        </section>

        <section className="story-shell">
          <div className="wrap">
            <div className="story-grid">
              <aside className="founder-card" aria-label="Founder">
                <div className="founder-monogram" aria-hidden="true">
                  <span className="founder-monogram-letter">A</span>
                  <span className="founder-monogram-dot" />
                </div>
                <div className="founder-name">Akshay Thota</div>
                <div className="founder-role">Founder, Engineer</div>
                <dl className="founder-meta">
                  <div>
                    <dt>Based</dt>
                    <dd>Hyderabad, IN</dd>
                  </div>
                  <div>
                    <dt>Stack</dt>
                    <dd>Full-stack</dd>
                  </div>
                  <div>
                    <dt>Reach</dt>
                    <dd>WhatsApp</dd>
                  </div>
                </dl>
              </aside>

              <div className="story">
                <p className="story-lead">
                  Axhy is built by Akshay Thota — one person, working full-time on this in
                  Hyderabad. I&apos;m a full-stack engineer.
                </p>

                <p>
                  I&apos;ve shipped backend systems and mobile apps for the last few years. Axhy
                  started when I kept noticing the same gap: every Indian cleaning company I knew
                  was running on WhatsApp groups and Excel files no one could find.
                </p>

                <p>
                  Most software for this industry is from outside India. It speaks English. It wants
                  typing. It assumes office workers. Indian cleaning has supervisors who manage on
                  the floor, in Telugu, on a phone, between visits. Axhy is built for that reality.
                </p>

                <p>
                  Voice-first capture. AI verification of work. A living context that learns each
                  company&apos;s specific operations over time. The longer you use it, the harder it
                  is to leave.
                </p>

                <p>
                  I&apos;m working with the first 10 customers personally. We sit with your HR team
                  for an afternoon, set you up, and run your first month with you. After that, the
                  system runs itself and I focus on the next 10.
                </p>

                <blockquote className="pullquote">
                  <span className="pullquote-mark">— On the work</span>
                  One person. One product. One reason — to give Indian cleaning companies the
                  software they deserve.
                </blockquote>

                <div className="about-cta">
                  <WhatsAppButton label="Talk to founder directly" />
                  <span className="about-cta-text">Usually under an hour during work days.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
