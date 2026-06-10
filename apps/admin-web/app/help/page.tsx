/**
 * Help `/help` — the page the worker app's "Help & support" button opens.
 *
 * Before this page existed, `WorkerDrawer.tsx` linked to axhy.app/help which
 * redirected to the admin /login wall — a worker asking for help got a locked
 * door (walk worker-screens 2026-06-10-2345, bug #3 / RCA C-A part 3).
 *
 * Content rules: worker-first plain English, short sentences, no jargon, only
 * REAL channels (support@axhy.app is already published in the mobile consent
 * screen; "ask your supervisor" matches the in-app support card). Expand with
 * Telugu/Hindi when the localization pass lands.
 *
 * @derives(walk worker-screens 2026-06-10-2345 bug #3)
 * @derives(ADR-0005)
 */

import { Nav } from '../_components/Nav';
import { Footer } from '../_components/Footer';

export default function HelpPage() {
  return (
    <div className="page">
      <Nav />

      <main>
        <section className="legal-hero">
          <div className="wrap">
            <div className="eyebrow">Axhy help</div>
            <h1 className="legal-h1">Need help?</h1>
          </div>
        </section>

        <section className="legal-body">
          <div className="wrap">
            <article className="legal-prose">
              <h2>If you are a worker</h2>
              <p>
                <strong>Ask your supervisor first.</strong> For anything about your sites, your
                shifts, your leave, or your pay — your supervisor is the fastest answer. Their phone
                number is on your profile screen in the app.
              </p>
              <p>
                <strong>App not working?</strong> Try these in order: check your internet, close and
                reopen the app, then sign out and sign in again. Your work photos are saved on your
                phone and finish uploading on their own when the internet returns — you will not
                lose them.
              </p>
              <p>
                <strong>Still stuck?</strong> Email{' '}
                <a href="mailto:support@axhy.app">support@axhy.app</a> with your phone number and
                what happened. We read every message.
              </p>

              <h2>If you are a supervisor or company admin</h2>
              <p>
                Use the same email — <a href="mailto:support@axhy.app">support@axhy.app</a> — and
                tell us your company name. For anything urgent during a pilot, use the WhatsApp
                channel you already have with the Axhy team.
              </p>

              <h2>Your data</h2>
              <p>
                What we store and why is explained in plain words in the app when you sign in, and
                on our <a href="/privacy">privacy page</a>. You can ask us to delete your account by
                email at any time.
              </p>
            </article>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
