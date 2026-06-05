/**
 * PolicyEditor Client Component
 * Renders settings forms for configuring key company rules and AI limits.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { updatePolicyAction } from '../actions';
import styles from '../owner.module.css';

type PolicyRowProps = {
  title: string;
  desc: string;
  policyKey: string;
  category: 'sla' | 'notification' | 'worker' | 'hr' | 'ai' | 'owner' | 'handoff';
  valueType: 'boolean' | 'number' | 'string';
  currentValue: unknown;
  defaultValue: unknown;
};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.saveBtn}>
      {pending ? 'Saving...' : 'Save'}
    </button>
  );
}

function PolicyRow({
  title,
  desc,
  policyKey,
  category,
  valueType,
  currentValue,
  defaultValue,
}: PolicyRowProps) {
  const [state, formAction] = useActionState(updatePolicyAction, null);
  const [success, setSuccess] = useState(false);

  const activeValue =
    currentValue !== undefined && currentValue !== null ? currentValue : defaultValue;

  useEffect(() => {
    if (state?.ok) {
      setSuccess(true);
      const t = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <div className={styles.policyRow}>
      <div className={styles.policyInfo}>
        <div className={styles.policyTitle}>{title}</div>
        <div className={styles.policyKey}>{policyKey}</div>
        <div className={styles.policyDesc}>{desc}</div>
      </div>
      <form action={formAction} className={styles.policyForm}>
        <input type="hidden" name="key" value={policyKey} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="valueType" value={valueType} />

        <div className={styles.inputContainer}>
          {valueType === 'boolean' && (
            <select name="value" defaultValue={String(activeValue)} className={styles.selectInput}>
              <option value="true">True / Yes</option>
              <option value="false">False / No</option>
            </select>
          )}

          {valueType === 'number' && (
            <input
              type="number"
              name="value"
              defaultValue={String(activeValue)}
              className={styles.numberInput}
              min="0"
              required
            />
          )}

          {valueType === 'string' && policyKey.includes('language') && (
            <select name="value" defaultValue={String(activeValue)} className={styles.selectInput}>
              <option value="hi">Hindi</option>
              <option value="te">Telugu</option>
              <option value="ta">Tamil</option>
              <option value="kn">Kannada</option>
              <option value="en">English</option>
            </select>
          )}

          {valueType === 'string' && !policyKey.includes('language') && (
            <input
              type="text"
              name="value"
              defaultValue={String(activeValue)}
              className={styles.textInput}
              required
            />
          )}

          <SubmitBtn />
        </div>

        {success && (
          <div className={styles.successMessage} role="status">
            Saved successfully!
          </div>
        )}
        {state && !state.ok && (
          <div className={styles.errorMessage} role="alert">
            {state.message}
          </div>
        )}
      </form>
    </div>
  );
}

type PolicyEditorProps = {
  initialPolicies: Array<{
    key: string;
    value: unknown;
    category: string;
  }>;
};

export function PolicyEditor({ initialPolicies }: PolicyEditorProps) {
  const getPolicyVal = (key: string) => {
    return initialPolicies.find((p) => p.key === key)?.value;
  };

  return (
    <div className={styles.settingsSection}>
      <h2 className={styles.sectionTitle}>Global Company Policies & AI Configurations</h2>
      <p className={styles.sectionDesc}>
        Manage business parameters, salary deductions, and active AI model safety limits. These
        settings apply company-wide.
      </p>

      <div className={styles.policyList}>
        <PolicyRow
          title="Daily AI Spend Cap (INR)"
          policyKey="ai.limits.daily_spend_cap"
          desc="The maximum budget in Rupees allowed for AI vision verifications per day. Safety alerts trigger when daily spend is close to this threshold."
          category="ai"
          valueType="number"
          currentValue={getPolicyVal('ai.limits.daily_spend_cap')}
          defaultValue={1000}
        />

        <PolicyRow
          title="Wage Deduction for Absence (Paise)"
          policyKey="salary.deductions.daily_absence_paise"
          desc="Amount in paise (e.g. 50000 paise = ₹500) deducted from a worker's payroll for each marked absence."
          category="owner"
          valueType="number"
          currentValue={getPolicyVal('salary.deductions.daily_absence_paise')}
          defaultValue={50000}
        />

        <PolicyRow
          title="Uniform Compliance Mandatory"
          policyKey="ai.rules.company.uniform_required"
          desc="Enable strictly checking for company uniform in AI vision photo verification of cleaner presence."
          category="owner"
          valueType="boolean"
          currentValue={getPolicyVal('ai.rules.company.uniform_required')}
          defaultValue={true}
        />

        <PolicyRow
          title="Default Preferred Language"
          policyKey="ai.rules.hr.preferred_language_default"
          desc="The default language assigned to new workers for OTP invitations and messages."
          category="hr"
          valueType="string"
          currentValue={getPolicyVal('ai.rules.hr.preferred_language_default')}
          defaultValue="hi"
        />
      </div>
    </div>
  );
}
