/**
 * Terms `/terms` — placeholder for v1.0 marketing site.
 *
 * Panel-locked stub (Vinod Patel + Tanvi Bhatia, 2026-04-30): same
 * reasoning as /privacy — Vinod hard-blocked /pricing while this
 * link 404'd. Content is plain, founder-honest, and points all real
 * disputes to direct WhatsApp during pilot.
 *
 * @derives(ADR-0005)
 * @derives(panel-2026-04-30: Vinod hard-block resolved by stub)
 */

import { Nav } from '../_components/Nav';
import { Footer } from '../_components/Footer';

export default function TermsPage() {
  return (
    <div className="page">
      <Nav />

      <main>
        <section className="legal-hero">
          <div className="wrap">
            <div className="eyebrow">Last updated 2026-04-30</div>
            <h1 className="legal-h1">Terms.</h1>
          </div>
        </section>

        <section className="legal-body">
          <div className="wrap">
            <article className="legal-prose">
              <p>
                Axhy is operated by a solo founder in Hyderabad, India. These terms govern use of
                the marketing site at axhy.app and the Axhy product. They are written plainly so a
                real owner can read them in five minutes.
              </p>

              <h2>The pilot</h2>
              <p>
                The first thirty days are free. During the pilot, the founder works with you to set
                up sites, supervisors, and workers. There is no card on file. If the pilot does not
                work for you, the relationship ends and your data is exported to you on request. No
                invoice is raised for the pilot period.
              </p>

              <h2>Pricing after the pilot</h2>
              <p>
                After the pilot, billing is per visit completed at ₹8/visit, with a minimum of
                ₹2,000/month. Invoices are raised at the start of each month with NET 30 payment
                terms. AI cost is included in the visit price and is never billed separately.
              </p>

              <h2>Cancellation</h2>
              <p>
                Either side may end the relationship with thirty days&apos; notice. If you cancel,
                your data is exported to you and then deleted from active systems. We may retain
                backups for up to ninety days as a safety net before final deletion.
              </p>

              <h2>What you are responsible for</h2>
              <p>
                You are responsible for accurate site information, lawful use of Axhy on your
                operations, and for keeping login credentials secure on phones used by your
                supervisors and workers.
              </p>

              <h2>What we are responsible for</h2>
              <p>
                We are responsible for keeping Axhy running, for security of stored data, and for
                truthful billing. If Axhy is down for more than four hours in a month, the founder
                will pro-rate that month&apos;s bill.
              </p>

              <h2>Disputes</h2>
              <p>
                During pilot, message the founder on WhatsApp from the{' '}
                <a href="/contact" className="legal-link">
                  contact page
                </a>
                . Most issues are resolved the same day. Indian law applies; jurisdiction is
                Hyderabad, Telangana.
              </p>

              <h2>Changes</h2>
              <p>
                When these terms change, the &ldquo;Last updated&rdquo; date at the top changes with
                them. We will tell you about material changes by WhatsApp before they take effect.
              </p>
            </article>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
