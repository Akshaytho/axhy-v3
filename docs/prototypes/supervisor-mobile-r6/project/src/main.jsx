/* global React, ReactDOM, AxhyPhoneApp, AxhyData */

function Mount() {
  const ravi = AxhyData.personas.ravi;
  const ramesh = AxhyData.personas.ramesh;

  return (
    <>
      <header
        style={{
          padding: '40px 48px 24px',
          maxWidth: 1240,
          margin: '0 auto',
        }}
      >
        <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 6 }}>
          AXHY V3 · SUPERVISOR MOBILE · R6 · TODAY · DECISIONS · ACTIVITY · CHAT
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: '-0.8px',
            color: 'var(--ink)',
            maxWidth: 820,
            lineHeight: 1.1,
          }}
        >
          Scan first. Act second. Inspect last.
        </div>
        <div
          className="t-body"
          style={{
            color: 'var(--ink-2)',
            marginTop: 12,
            maxWidth: 760,
            lineHeight: 1.55,
          }}
        >
          r6 polish over r5 lock. Decisions screen now tier-grouped (Needs you now / Routine /
          Failed) with size hierarchy. Urgent cards trimmed one more level (no meta line, 40-char
          body). Chat older bubbles dimmed. Visual reference: Zomato / PhonePe / Rapido.
        </div>
        <div
          style={{
            marginTop: 18,
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <span>r6 · 2026-05-12</span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span>tokens: paper + terracotta</span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span>5 tabs · scan / act / inspect</span>
        </div>
      </header>

      {/* All 4 main tabs in layer-1 density-reduced form. Tap to see layer-2 detail. */}
      <main
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 32,
          flexWrap: 'wrap',
          padding: '24px 24px 96px',
        }}
      >
        <AxhyPhoneApp
          key="today"
          initialTab="today"
          persona={ravi}
          label="TODAY — SCAN LAYER"
          sublabel="Compressed site cards · tap to expand workers"
        />
        <AxhyPhoneApp
          key="decisions"
          initialTab="decisions"
          persona={ravi}
          label="DECISIONS — SCAN LAYER"
          sublabel="Lighter cards · long reason hidden by default"
        />
        <AxhyPhoneApp
          key="activity"
          initialTab="activity"
          persona={ramesh}
          label="ACTIVITY — SCAN LAYER"
          sublabel="Tap row to reveal Share / Reverse"
        />
        <AxhyPhoneApp
          key="chat"
          initialTab="chat"
          persona={ravi}
          label="CHAT — CAPTURE ONLY"
          sublabel="Messy input · batches push to Decisions"
        />
      </main>

      <footer
        style={{
          padding: '0 48px 80px',
          maxWidth: 1240,
          margin: '0 auto',
          color: 'var(--ink-3)',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <div className="t-caption" style={{ color: 'var(--ink-3)', marginBottom: 10 }}>
          R6 DESIGN PASS NOTES · 2026-05-12
        </div>
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Today.</strong> Urgency banner pinned top (when
            sites short or visits flagged). 3-metric floor pulse (ON SITE / SHORT / PENDING). Site
            cards default collapsed with compact coverage pill (FULL / N SHORT) +
            tap-to-view-workers affordance.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Decisions.</strong> Tier-grouped sections:{' '}
            <em>Needs you now</em> (urgent — full card, 40-char body, no meta line) /{' '}
            <em>Routine</em> (ultra-compact rows — dot + title + ▸) / <em>Failed · review</em>{' '}
            (faded gray rows). Tap any row to expand inline for Apply.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Activity.</strong> Share-to-WhatsApp + Reverse
            hidden by default. Tap row to reveal action drawer. ChevronRight signals tap affordance.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Chat.</strong> Capture surface. Inline
            DecisionCards removed — thin link bubbles only (
            <em>"→ N decisions added — review in Decisions"</em>). Older message pairs dimmed to 55%
            opacity so most recent exchange dominates.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Shell.</strong> Every tab top app bar with
            hamburger ☰ + drawer (profile, memory rules, sites, language, notifications, help,
            temporary mode, sign out). Zomato/Rapido pattern.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Hidden by default:</strong> audit timestamps,
            rule sources, scope IDs, long failure blocks, repeated worker/site labels in urgent
            cards.
          </li>
          <li>
            <strong style={{ color: 'var(--ink)' }}>Next pass r7:</strong> push-nav detail screens
            (Site Detail, Decision Detail, Event Detail) + bottom sheets (worker quick actions,
            event row actions). True forward-navigation stack, not inline expand.
          </li>
        </ul>
      </footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Mount />);
