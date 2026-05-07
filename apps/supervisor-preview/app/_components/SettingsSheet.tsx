/**
 * SettingsSheet — opens from the gear icon. Shows the supervisor's profile
 * (avatar, name, role) plus the locked Company rules + 5 personal rule
 * sections collapsed.
 *
 * Re-uses the same pattern as the v0.2 Profile tab but accessed as a single
 * sheet over the action-first home rather than as a tab.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useState } from 'react';

import {
  COMPANY_SUPERVISOR_RULES,
  PERSONAL_RULES_DEFAULT,
  SUPERVISOR,
  type PersonalRules,
} from '../_lib/mock';

const LANG_LABEL: Record<PersonalRules['language'], string> = {
  hi: 'Hindi',
  en: 'English',
  te: 'Telugu',
  mixed: 'Mixed (auto)',
};

const SECTION_LIST: Array<{ key: keyof Omit<PersonalRules, 'language'>; title: string }> = [
  { key: 'sites', title: 'Sites you manage' },
  { key: 'workers', title: 'Workers and how to use them' },
  { key: 'escalation', title: 'Escalation and reachability' },
  { key: 'style', title: 'Your communication style' },
];

/** @derives(master-plan §G) */
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [rules, setRules] = useState<PersonalRules>(PERSONAL_RULES_DEFAULT);
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (openKey === 'company') {
    return <CompanyRulesSheet onBack={() => setOpenKey(null)} onClose={onClose} />;
  }
  if (openKey === 'language') {
    return (
      <LanguageSheet
        current={rules.language}
        onSet={(v) => setRules({ ...rules, language: v })}
        onBack={() => setOpenKey(null)}
        onClose={onClose}
      />
    );
  }
  const sectionEntry = SECTION_LIST.find((e) => e.key === openKey);
  if (sectionEntry) {
    return (
      <TextSectionSheet
        title={sectionEntry.title}
        value={rules[sectionEntry.key]}
        onSave={(text) => setRules({ ...rules, [sectionEntry.key]: text })}
        onBack={() => setOpenKey(null)}
        onClose={onClose}
      />
    );
  }

  const companyRuleCount = COMPANY_SUPERVISOR_RULES.split('\n').filter((l) =>
    l.trim().startsWith('-'),
  ).length;

  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button type="button" className="sup-back" onClick={onClose} aria-label="Close">
          ‹
        </button>
        <span className="sup-sheet-title">Settings</span>
      </div>
      <div className="sup-sheet-body">
        <div className="sup-profile-header" style={{ padding: '4px 0 8px' }}>
          <div className="sup-avatar">{SUPERVISOR.name[0]}</div>
          <div>
            <div className="sup-profile-name">{SUPERVISOR.name}</div>
            <div className="sup-profile-sub">Supervisor at {SUPERVISOR.workingAt}</div>
          </div>
        </div>

        <div className="sup-section-list" style={{ padding: 0 }}>
          <div
            className="sup-section-row is-locked"
            onClick={() => setOpenKey('company')}
            role="button"
            tabIndex={0}
          >
            <div>
              <div className="sup-section-row-title">Company rules</div>
              <div className="sup-section-row-sub">
                {companyRuleCount} rules · set by Kavitha (HR)
              </div>
            </div>
            <span className="sup-rule-locked-tag">LOCKED</span>
          </div>

          {SECTION_LIST.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="sup-section-row"
              onClick={() => setOpenKey(entry.key)}
            >
              <span
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                }}
              >
                <span className="sup-section-row-title">{entry.title}</span>
                <span className="sup-section-row-sub">{rules[entry.key].length} chars</span>
              </span>
              <span className="sup-action-arrow">›</span>
            </button>
          ))}

          <button type="button" className="sup-section-row" onClick={() => setOpenKey('language')}>
            <span
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              <span className="sup-section-row-title">Language</span>
              <span className="sup-section-row-sub">{LANG_LABEL[rules.language]}</span>
            </span>
            <span className="sup-action-arrow">›</span>
          </button>
        </div>

        <div
          style={{
            padding: '16px 0 0',
            color: 'var(--text-mute)',
            fontFamily: 'var(--mono)',
            fontSize: 11,
          }}
        >
          {SUPERVISOR.phone} · last login just now
        </div>
        <button type="button" className="sup-secondary" disabled style={{ marginTop: 16 }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

/** @derives(master-plan §G) */
function CompanyRulesSheet({
  onBack,
  onClose: _onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const lines = COMPANY_SUPERVISOR_RULES.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, ''));
  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button type="button" className="sup-back" onClick={onBack}>
          ‹
        </button>
        <span className="sup-sheet-title">Company rules</span>
      </div>
      <div className="sup-sheet-body">
        <ul className="sup-bullet-list">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <p style={{ marginTop: 16, color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 13 }}>
          Set by Kavitha (HR). Ask her to change.
        </p>
      </div>
    </div>
  );
}

/** @derives(master-plan §G) */
function TextSectionSheet({
  title,
  value,
  onSave,
  onBack,
  onClose: _onClose,
}: {
  title: string;
  value: string;
  onSave: (text: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => onBack(), 1500);
  };
  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button type="button" className="sup-back" onClick={onBack}>
          ‹
        </button>
        <span className="sup-sheet-title">{title}</span>
      </div>
      <div className="sup-sheet-body">
        <textarea
          className="sup-rule-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          rows={8}
        />
        {saved && <div className="sup-update-acked">Saved</div>}
        <div className="sup-bottom-action" style={{ position: 'static', marginTop: 16 }}>
          <button type="button" className="sup-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** @derives(master-plan §G) */
function LanguageSheet({
  current,
  onSet,
  onBack,
  onClose: _onClose,
}: {
  current: PersonalRules['language'];
  onSet: (v: PersonalRules['language']) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button type="button" className="sup-back" onClick={onBack}>
          ‹
        </button>
        <span className="sup-sheet-title">Language</span>
      </div>
      <div className="sup-sheet-body">
        <div className="sup-lang-row">
          {(Object.keys(LANG_LABEL) as Array<PersonalRules['language']>).map((k) => (
            <button
              key={k}
              type="button"
              className={current === k ? 'sup-lang-pill is-on' : 'sup-lang-pill'}
              onClick={() => {
                onSet(k);
                onBack();
              }}
            >
              {LANG_LABEL[k]}
            </button>
          ))}
        </div>
        <p style={{ marginTop: 16, color: 'var(--text-dim)', fontSize: 13, fontWeight: 700 }}>
          Mixed lets you write in any combination — the AI mirrors your style.
        </p>
      </div>
    </div>
  );
}
