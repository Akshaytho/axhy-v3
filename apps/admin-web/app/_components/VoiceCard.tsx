/**
 * Telugu voice-capture card — Direction A homepage hero illustration.
 *
 * Pure visual. The pulse + wave animations live in globals.css.
 *
 * Telugu transliteration verified by Aditya Joshi (panel voice engineer):
 *   "5 chesnam"      = "we did 5"
 *   "repair lo undi" = "is in repair"
 *   "supervisor late ayyaru" = "supervisor came late"
 *
 * Tag '5 visits · processed' (softened from '5 visits · verified' per
 * Aanya Mehta — original wording overstated AI verification speed).
 *
 * @derives(ADR-0005)
 */

const WAVE_BARS = [
  -1.2, -1.0, -0.8, -0.6, -0.4, -0.2, 0, -0.2, -0.4, -0.6, -0.8, -1.0, -1.2, -1.0, -0.8, -0.6, -0.4,
  -0.2, 0, -0.2,
];

export function VoiceCard() {
  return (
    <aside className="hero-side" aria-hidden="true">
      <div className="voice-card">
        <div className="vc-meta">
          <span className="live">Recording · Telugu</span>
          <span>Site 12 · 06:47</span>
        </div>
        <div className="vc-quote">
          {'"Bathroom cleaning '}
          <span className="hl">5 chesnam</span>
          {', water tank '}
          <span className="hl">repair lo undi</span>
          {', supervisor late ayyaru."'}
        </div>
        <div className="vc-wave">
          {WAVE_BARS.map((delay, i) => (
            <span key={i} style={{ animationDelay: `${delay}s` }} />
          ))}
        </div>
      </div>
      <div className="voice-tags">
        <span className="vc-tag is-on">5 visits · processed</span>
        <span className="vc-tag">Maintenance flag</span>
        <span className="vc-tag">Attendance: −1</span>
        <span className="vc-tag">Site context updated</span>
      </div>
    </aside>
  );
}
