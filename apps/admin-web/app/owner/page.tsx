/**
 * Owner Dashboard Portal page — /owner.
 *
 * Server component. Gates access to OWNER role, fetches daily summary
 * and policy logs from the backend, and renders the stats cards and
 * PolicyEditor.
 *
 * @derives(master-plan §G)
 * @derives(office_profiles_specification.md)
 */

import { fetchJson } from '../../lib/api';
import { requireRole } from '../../lib/auth';

import { PolicyEditor } from './_components/PolicyEditor';
import styles from './owner.module.css';

type OwnerSummaryResponse = {
  company: {
    id: string;
    name: string;
    slug: string;
    status: string;
    aiSpendDailyInr: string;
    createdAt: string;
  };
  stats: {
    activeWorkers: number;
    activeSites: number;
    absentWorkersToday: number;
    pendingReviews: number;
  };
  policies: Array<{
    id: string;
    key: string;
    value: unknown;
    category: string;
    setAt: string;
  }>;
};

/**
 * Server Component for /owner page.
 *
 * @derives(master-plan §G)
 */
export default async function OwnerDashboardPage() {
  await requireRole('OWNER');

  const data = await fetchJson<OwnerSummaryResponse>('/admin/owner-summary');
  const { company, stats, policies } = data;

  // Retrieve AI daily spend cap policy or default to 1000 INR
  const spendCapVal = policies.find((p) => p.key === 'ai.limits.daily_spend_cap')?.value;
  const spendLimit = typeof spendCapVal === 'number' ? spendCapVal : 1000;
  const currentSpend = parseFloat(company.aiSpendDailyInr);

  const spendPercentage = Math.min(Math.round((currentSpend / spendLimit) * 100), 100);
  const isNearLimit = currentSpend >= spendLimit * 0.8;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <div className={styles.eyebrow}>Owner Portal</div>
        <h1 className={styles.title}>{company.name} Dashboard</h1>
        <p className={styles.subtitle}>
          Set business rules, configure salary structures, and monitor AI spending metrics for
          2,000+ employees.
        </p>
      </header>

      {/* Main Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>🧹</span>
            <span className={styles.cardBadge}>Roster</span>
          </div>
          <h2 className={styles.cardTitle}>Active Workers</h2>
          <div className={styles.cardValue}>{stats.activeWorkers}</div>
          <p className={styles.cardDesc}>
            Cleaners and supervisor field staff assigned to cleanings.
          </p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>🏢</span>
            <span className={styles.cardBadge}>Sites</span>
          </div>
          <h2 className={styles.cardTitle}>Cleaning Sites</h2>
          <div className={styles.cardValue}>{stats.activeSites}</div>
          <p className={styles.cardDesc}>
            Geolocated commercial, residential, and corporate facilities.
          </p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>📅</span>
            <span className={styles.cardBadge}>Absence</span>
          </div>
          <h2 className={styles.cardTitle}>Absences Today</h2>
          <div className={styles.cardValue}>{stats.absentWorkersToday}</div>
          <p className={styles.cardDesc}>Cleaners marked absent by field supervisors today.</p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>⚠️</span>
            <span className={styles.cardBadge}>Flagged</span>
          </div>
          <h2 className={styles.cardTitle}>Pending AI Reviews</h2>
          <div className={styles.cardValue}>{stats.pendingReviews}</div>
          <p className={styles.cardDesc}>Flagged visits awaiting supervisor resolution.</p>
        </div>
      </div>

      {/* Spend Tracker Card */}
      <div className={styles.spendTrackerCard}>
        <div className={styles.spendHeader}>
          <div>
            <h2 className={styles.spendTitle}>Real-Time AI Verification Spend</h2>
            <p className={styles.spendSubtitle}>
              Cost computed atomically from LLM vision tokens on visit verifications today.
            </p>
          </div>
          <div className={styles.spendNumbers}>
            <span className={styles.spendCurrent}>₹ {currentSpend.toFixed(2)}</span>
            <span className={styles.spendSeparator}>/</span>
            <span className={styles.spendLimit}>₹ {spendLimit}</span>
          </div>
        </div>

        <div className={styles.progressBarWrapper}>
          <div
            className={`${styles.progressBar} ${isNearLimit ? styles.progressBarWarning : ''}`}
            style={{ width: `${spendPercentage}%` }}
          />
        </div>

        <div className={styles.spendFooter}>
          <span>{spendPercentage}% of daily limit consumed</span>
          {isNearLimit && (
            <span className={styles.warningMessage}>
              ⚠️ Warning: Near AI budget limit. Vision verification may degrade when cap is reached.
            </span>
          )}
        </div>
      </div>

      {/* Policy Settings Panel */}
      <PolicyEditor initialPolicies={policies} />
    </div>
  );
}
