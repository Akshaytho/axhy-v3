/**
 * ProfileTab — Profile tab for the Axhy supervisor mobile preview.
 *
 * Shows the supervisor identity header, then two rule sections:
 * company rules (locked, set by HR) and five personal rule cards
 * (editable in-place). Language preference uses pill selection.
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

/** Language pill configuration. @derives(master-plan §G) */
const LANG_PILLS: { value: PersonalRules['language']; label: string }[] = [
  { value: 'hi', label: 'Hindi' },
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'mixed', label: 'Mixed (auto)' },
];

/** Personal rule section definitions (excludes 'language', handled separately). @derives(master-plan §G) */
const TEXT_SECTIONS: { key: Exclude<keyof PersonalRules, 'language'>; title: string }[] = [
  { key: 'sites', title: 'Sites you manage' },
  { key: 'workers', title: 'Workers and how to use them' },
  { key: 'escalation', title: 'Escalation and reachability' },
  { key: 'style', title: 'Your communication style' },
];

/** State for a single editable section. @derives(master-plan §G) */
type SectionEditState = {
  key: Exclude<keyof PersonalRules, 'language'>;
  draftValue: string;
};

/** @derives(master-plan §G) */
export function ProfileTab({
  timeOfDay: _timeOfDay,
}: {
  timeOfDay: TimeOfDay;
}): React.ReactElement {
  const [rules, setRules] = useState<PersonalRules>({ ...PERSONAL_RULES_DEFAULT });
  const [editing, setEditing] = useState<SectionEditState | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Flash "Saved" near the edit button for 2 seconds. @derives(master-plan §G) */
  function flashSaved(key: string): void {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSavedKey(key);
    saveTimerRef.current = setTimeout(() => setSavedKey(null), 2000);
  }

  /** Open a text section for editing; discard any open section first. @derives(master-plan §G) */
  function openEdit(key: Exclude<keyof PersonalRules, 'language'>): void {
    setEditing({ key, draftValue: rules[key] });
  }

  /** Cancel editing — revert draft. @derives(master-plan §G) */
  function cancelEdit(): void {
    setEditing(null);
  }

  /** Commit draft to local state. @derives(master-plan §G) */
  function commitEdit(): void {
    if (!editing) return;
    setRules((prev) => ({ ...prev, [editing.key]: editing.draftValue }));
    const key = editing.key;
    setEditing(null);
    flashSaved(key);
  }

  /** Handle edit button click — open or open-while-replacing. @derives(master-plan §G) */
  function handleEditClick(key: Exclude<keyof PersonalRules, 'language'>): void {
    if (editing && editing.key !== key) {
      // Discard the open section before opening the new one.
      setEditing({ key, draftValue: rules[key] });
    } else {
      openEdit(key);
    }
  }

  /** Set language pill selection. @derives(master-plan §G) */
  function selectLanguage(value: PersonalRules['language']): void {
    setRules((prev) => ({ ...prev, language: value }));
  }

  return (
    <>
      {/* ── Profile header ─────────────────────────────────────────── */}
      <div className="sup-profile-header">
        <div className="sup-avatar">S</div>
        <div>
          <div className="sup-profile-name">{SUPERVISOR.name}</div>
          <div className="sup-profile-sub">Supervisor at {SUPERVISOR.workingAt}</div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="sup-screen-content">
        {/* Eyebrow + hint */}
        <div className="sup-rule-section">
          <p className="sup-eyebrow">YOUR RULES</p>
          <p className="sup-rule-body" style={{ marginTop: 6 }}>
            The AI uses these to work the way you work. Edit anytime — changes take effect at
            tomorrow&apos;s 3:30 AM context refresh.
          </p>
        </div>

        {/* ── Section 0: Company rules (locked) ──────────────────── */}
        <div className="sup-rule-section">
          <div className="sup-rule-card is-locked">
            <div className="sup-rule-head">
              <span className="sup-rule-title">Company rules</span>
              <span className="sup-rule-locked-tag">SET BY HR</span>
            </div>
            <p className="sup-rule-body">{COMPANY_SUPERVISOR_RULES}</p>
            <p className="sup-rule-body" style={{ fontStyle: 'italic', marginTop: 2 }}>
              Set by Kavitha (HR). Ask her to change.
            </p>
          </div>
        </div>

        {/* ── Sections 1–4: Text rule cards ──────────────────────── */}
        {TEXT_SECTIONS.map(({ key, title }) => {
          const isEditing = editing?.key === key;
          const isSaved = savedKey === key;

          return (
            <div key={key} className="sup-rule-section">
              <div className="sup-rule-card">
                <div className="sup-rule-head">
                  <span className="sup-rule-title">{title}</span>
                  {isEditing ? (
                    <span className="sup-rule-edit" onClick={cancelEdit}>
                      Cancel
                    </span>
                  ) : isSaved ? (
                    <span className="sup-rule-edit sup-update-acked">Saved</span>
                  ) : (
                    <span className="sup-rule-edit" onClick={() => handleEditClick(key)}>
                      Edit
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <textarea
                      className="sup-rule-textarea"
                      autoFocus
                      value={editing.draftValue}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev ? { ...prev, draftValue: e.target.value } : prev,
                        )
                      }
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button className="sup-secondary" type="button" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button className="sup-primary" type="button" onClick={commitEdit}>
                        Save
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="sup-rule-body">{rules[key]}</p>
                )}
              </div>
            </div>
          );
        })}

        {/* ── Section 5: Language preference (pills) ─────────────── */}
        <div className="sup-rule-section">
          <div className="sup-rule-card">
            <div className="sup-rule-head">
              <span className="sup-rule-title">Language preference</span>
            </div>
            <div className="sup-lang-row">
              {LANG_PILLS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`sup-lang-pill${rules.language === value ? ' is-on' : ''}`}
                  onClick={() => selectLanguage(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── "What Mixed means" explainer ───────────────────────── */}
        <div className="sup-card">
          <p className="sup-h2">What &apos;Mixed&apos; means</p>
          <p>
            If you write in Hindi-English-Telugu mix, the AI will reply in the same mix. It
            won&apos;t &apos;fix&apos; your typing or translate. Set a single language only if you
            want strict replies.
          </p>
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div
          style={{ padding: '12px 20px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <p className="sup-profile-sub">
            Phone: {SUPERVISOR.phone} · Last login: just now · Multi-company: 1
          </p>
          <button className="sup-secondary" type="button" disabled>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
