/**
 * ProfileTab — "My setup" for the Axhy supervisor mobile preview.
 *
 * One question, one big answer. Six collapsed section rows on landing.
 * Tap any row to open a sheet for viewing or editing that section.
 * Company rules are locked (set by HR). Personal rules are editable.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useState, useRef } from 'react';

import {
  SUPERVISOR,
  COMPANY_SUPERVISOR_RULES,
  PERSONAL_RULES_DEFAULT,
  type PersonalRules,
  type TimeOfDay,
} from '../_lib/mock';

/** Language pill options. @derives(master-plan §G) */
const LANG_PILLS: { value: PersonalRules['language']; label: string }[] = [
  { value: 'hi', label: 'Hindi' },
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'mixed', label: 'Mixed' },
];

/** Label for a language code. @derives(master-plan §G) */
function langLabel(value: PersonalRules['language']): string {
  return LANG_PILLS.find((p) => p.value === value)?.label ?? value;
}

/** Parsed bullet items + count from COMPANY_SUPERVISOR_RULES. @derives(master-plan §G) */
const COMPANY_RULE_BULLETS: string[] = COMPANY_SUPERVISOR_RULES.split('\n')
  .filter((l) => l.trimStart().startsWith('-'))
  .map((l) => l.replace(/^\s*-\s*/, ''));
const COMPANY_RULE_COUNT = COMPANY_RULE_BULLETS.length;

/** Which sheet is open. @derives(master-plan §G) */
type OpenSheet = 'company' | 'sites' | 'workers' | 'escalation' | 'style' | 'language' | null;

/** Titles for each text section sheet. @derives(master-plan §G) */
const SECTION_TITLES: Record<Exclude<OpenSheet, 'company' | 'language' | null>, string> = {
  sites: 'Sites you manage',
  workers: 'Workers and how to use them',
  escalation: 'Escalation and reachability',
  style: 'Your communication style',
};

/** Editable personal rule keys. @derives(master-plan §G) */
type TextKey = Exclude<keyof PersonalRules, 'language'>;

/** @derives(master-plan §G) */
export function ProfileTab({
  timeOfDay: _timeOfDay,
}: {
  timeOfDay: TimeOfDay;
}): React.ReactElement {
  const [rules, setRules] = useState<PersonalRules>({ ...PERSONAL_RULES_DEFAULT });
  const [open, setOpen] = useState<OpenSheet>(null);
  const [draft, setDraft] = useState<string>('');
  const [draftLang, setDraftLang] = useState<PersonalRules['language']>(rules.language);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Open a sheet, initializing draft state. @derives(master-plan §G) */
  function openSheet(sheet: OpenSheet): void {
    if (sheet === 'company') {
      setOpen('company');
      return;
    }
    if (sheet === 'language') {
      setDraftLang(rules.language);
      setOpen('language');
      return;
    }
    if (sheet !== null) {
      setDraft(rules[sheet as TextKey]);
      setOpen(sheet);
    }
  }

  /** Close sheet without saving. @derives(master-plan §G) */
  function closeSheet(): void {
    setOpen(null);
  }

  /** Commit draft text — flash Saved 2 s then close. @derives(master-plan §G) */
  function commitText(key: TextKey): void {
    setRules((prev) => ({ ...prev, [key]: draft }));
    flashThenClose();
  }

  /** Commit language selection — flash Saved 2 s then close. @derives(master-plan §G) */
  function commitLanguage(): void {
    setRules((prev) => ({ ...prev, language: draftLang }));
    flashThenClose();
  }

  /** Show "Saved" for 2 s then close the sheet. @derives(master-plan §G) */
  function flashThenClose(): void {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setSavedFlash(true);
    flashTimerRef.current = setTimeout(() => {
      setSavedFlash(false);
      setOpen(null);
    }, 2000);
  }

  /** Sub-line for a text rule row. @derives(master-plan §G) */
  function textSub(key: TextKey): string {
    const val = rules[key];
    if (!val.trim()) return '(empty)';
    return `${val.length} chars`;
  }

  return (
    <>
      {/* ── Profile header ───────────────────────────────────────── */}
      <div className="sup-profile-header">
        <div className="sup-avatar">S</div>
        <div>
          <div className="sup-profile-name">{SUPERVISOR.name}</div>
          <div className="sup-profile-sub">Supervisor at {SUPERVISOR.workingAt}</div>
        </div>
      </div>

      {/* ── Section list ─────────────────────────────────────────── */}
      <div className="sup-section-list">
        {/* Row 0: Company rules (locked) */}
        <div
          className="sup-section-row is-locked"
          onClick={() => openSheet('company')}
          style={{ cursor: 'pointer' }}
        >
          <div>
            <div className="sup-section-row-title">Company rules</div>
            <div className="sup-section-row-sub">
              {COMPANY_RULE_COUNT} rules · set by Kavitha (HR)
            </div>
          </div>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-mute)',
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            LOCKED
          </span>
        </div>

        {/* Row 1: Sites */}
        <div className="sup-section-row" onClick={() => openSheet('sites')}>
          <div>
            <div className="sup-section-row-title">Sites you manage</div>
            <div className="sup-section-row-sub">{textSub('sites')}</div>
          </div>
          <span className="sup-drill-chev">›</span>
        </div>

        {/* Row 2: Workers */}
        <div className="sup-section-row" onClick={() => openSheet('workers')}>
          <div>
            <div className="sup-section-row-title">Workers and how to use them</div>
            <div className="sup-section-row-sub">{textSub('workers')}</div>
          </div>
          <span className="sup-drill-chev">›</span>
        </div>

        {/* Row 3: Escalation */}
        <div className="sup-section-row" onClick={() => openSheet('escalation')}>
          <div>
            <div className="sup-section-row-title">Escalation and reachability</div>
            <div className="sup-section-row-sub">{textSub('escalation')}</div>
          </div>
          <span className="sup-drill-chev">›</span>
        </div>

        {/* Row 4: Style */}
        <div className="sup-section-row" onClick={() => openSheet('style')}>
          <div>
            <div className="sup-section-row-title">Your communication style</div>
            <div className="sup-section-row-sub">{textSub('style')}</div>
          </div>
          <span className="sup-drill-chev">›</span>
        </div>

        {/* Row 5: Language */}
        <div className="sup-section-row" onClick={() => openSheet('language')}>
          <div>
            <div className="sup-section-row-title">Language preference</div>
            <div className="sup-section-row-sub">{langLabel(rules.language)}</div>
          </div>
          <span className="sup-drill-chev">›</span>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 8 }}>
          <p className="sup-profile-sub" style={{ marginBottom: 10 }}>
            {SUPERVISOR.phone} · Last login: just now
          </p>
          <button className="sup-secondary" type="button" disabled>
            Sign out
          </button>
        </div>
      </div>

      {/* ── Sheet: Company rules (locked) ────────────────────────── */}
      {open === 'company' && (
        <div className="sup-sheet">
          <div className="sup-sheet-head">
            <button className="sup-back" type="button" onClick={closeSheet}>
              ‹
            </button>
            <span className="sup-sheet-title">Company rules</span>
          </div>
          <div className="sup-sheet-body">
            <ul className="sup-bullet-list">
              {COMPANY_RULE_BULLETS.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            <p
              style={{
                fontStyle: 'italic',
                color: 'var(--text-mute)',
                fontSize: 13,
                fontWeight: 500,
                marginTop: 4,
              }}
            >
              Set by Kavitha (HR). Ask her to change.
            </p>
          </div>
        </div>
      )}

      {/* ── Sheet: Text rule sections ─────────────────────────────── */}
      {open != null && open in SECTION_TITLES && (
        <TextRuleSheet
          title={SECTION_TITLES[open as keyof typeof SECTION_TITLES]}
          value={draft}
          savedFlash={savedFlash}
          onChange={setDraft}
          onCancel={closeSheet}
          onSave={() => commitText(open as TextKey)}
        />
      )}

      {/* ── Sheet: Language preference ───────────────────────────── */}
      {open === 'language' && (
        <div className="sup-sheet">
          <div className="sup-sheet-head">
            <button className="sup-back" type="button" onClick={closeSheet}>
              ‹
            </button>
            <span className="sup-sheet-title">Language preference</span>
          </div>
          <div className="sup-sheet-body">
            <div className="sup-lang-row">
              {LANG_PILLS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`sup-lang-pill${draftLang === value ? ' is-on' : ''}`}
                  onClick={() => setDraftLang(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '0 16px 8px', textAlign: 'center' }}>
            {savedFlash && (
              <span className="sup-update-acked" style={{ display: 'block', marginBottom: 8 }}>
                Saved
              </span>
            )}
            <button
              className="sup-secondary"
              type="button"
              onClick={closeSheet}
              style={{ marginBottom: 8 }}
            >
              Cancel
            </button>
          </div>
          <div className="sup-bottom-action">
            <button className="sup-primary" type="button" onClick={commitLanguage}>
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Inline sub-component for text-rule editing sheets. @derives(master-plan §G) */
function TextRuleSheet({
  title,
  value,
  savedFlash,
  onChange,
  onCancel,
  onSave,
}: {
  title: string;
  value: string;
  savedFlash: boolean;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}): React.ReactElement {
  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button className="sup-back" type="button" onClick={onCancel}>
          ‹
        </button>
        <span className="sup-sheet-title">{title}</span>
      </div>
      <div className="sup-sheet-body">
        <textarea
          className="sup-rule-textarea"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div style={{ padding: '0 16px 8px', textAlign: 'center' }}>
        {savedFlash && (
          <span className="sup-update-acked" style={{ display: 'block', marginBottom: 8 }}>
            Saved
          </span>
        )}
        <button
          className="sup-secondary"
          type="button"
          onClick={onCancel}
          style={{ marginBottom: 8 }}
        >
          Cancel
        </button>
      </div>
      <div className="sup-bottom-action">
        <button className="sup-primary" type="button" onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
}
