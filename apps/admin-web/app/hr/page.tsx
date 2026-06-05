import { fetchJson } from '../../lib/api';
import { requireRole } from '../../lib/auth';

import styles from './hr.module.css';

type Listing<T> = { items: T[]; nextCursor: string | null };

/**
 * HR dashboard server component.
 *
 * @derives(master-plan §G)
 */
export default async function HrDashboard() {
  await requireRole('HR');
  const [members, workers, sites, leaves] = await Promise.all([
    fetchJson<Listing<unknown>>('/admin/memberships?limit=1'),
    fetchJson<Listing<unknown>>('/admin/workers?limit=1'),
    fetchJson<Listing<unknown>>('/admin/sites?limit=1'),
    fetchJson<Listing<unknown>>('/leave-requests?limit=50'),
  ]);

  const cards = [
    {
      title: 'Company Memberships',
      count: members.items.length,
      hasMore: !!members.nextCursor,
      icon: '👥',
      desc: 'Registered company administrators and coordinators.',
      link: '/hr/memberships',
    },
    {
      title: 'Active Workers',
      count: workers.items.length,
      hasMore: !!workers.nextCursor,
      icon: '🧹',
      desc: 'Cleaners and field staff assigned to cleanings.',
      link: '/hr/workers',
    },
    {
      title: 'Cleaning Sites',
      count: sites.items.length,
      hasMore: !!sites.nextCursor,
      icon: '🏢',
      desc: 'Active commercial and hospital cleaning sites.',
      link: '/hr/sites',
    },
    {
      title: 'Pending Leave Requests',
      count: leaves.items.length,
      hasMore: !!leaves.nextCursor,
      icon: '📅',
      desc: 'Leave applications awaiting review or decision.',
      link: '/hr/leave-requests',
    },
  ];

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <div className={styles.eyebrow}>HR MANAGEMENT PORTAL</div>
        <h1 className={styles.title}>Overview Dashboard</h1>
        <p className={styles.subtitle}>
          Track memberships, workers, geocoded cleaning sites, and approve active leave requests.
        </p>
      </header>

      <div className={styles.statsGrid}>
        {cards.map((card) => (
          <div key={card.title} className={styles.statCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>{card.icon}</span>
              <span className={styles.cardBadge}>Active</span>
            </div>
            <h2 className={styles.cardTitle}>{card.title}</h2>
            <div className={styles.cardValue}>
              {card.count}
              {card.hasMore && <span className={styles.plus}>+</span>}
            </div>
            <p className={styles.cardDesc}>{card.desc}</p>
            <a href={card.link} className={styles.cardLink}>
              Manage directory &rarr;
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
