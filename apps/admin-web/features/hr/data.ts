/**
 * HR portal data layer — typed fetchers over the backend (server-only; cookie
 * auth via lib/api). Pages/screens call these, never raw URLs. Swap to the
 * generated @axhy/api-client later by changing only this file.
 */
import { fetchJson } from '../../lib/api';

type Paged<T> = { items: T[]; nextCursor: string | null };

/**
 * One site row for the HR site list.
 * @derives(master-plan §G)
 */
export type SiteListItem = {
  id: string;
  name: string;
  state: string;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  workdays: string;
  createdAt: string;
};

/**
 * One pending leave-request row for the HR list.
 * @derives(master-plan §G)
 */
export type LeaveListItem = {
  id: string;
  workerId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  state: string;
  createdAt: string;
};

/**
 * One complaint row for the HR complaint list.
 * @derives(master-plan §G)
 */
export type ComplaintListItem = {
  id: string;
  siteId: string;
  siteName: string;
  severity: string;
  state: string;
  kind: string;
  text: string;
  createdAt: string;
  unreadHrRepliesCount: number;
};

/**
 * Fetch the owned-sites list (GET /admin/sites).
 * @derives(master-plan §G)
 */
export const listSites = () => fetchJson<Paged<SiteListItem>>('/admin/sites?limit=50');
/**
 * Fetch the pending leave-request list (GET /leave-requests).
 * @derives(master-plan §G)
 */
export const listPendingLeave = () => fetchJson<Paged<LeaveListItem>>('/leave-requests?limit=50');
/**
 * Fetch the complaint list (GET /complaints).
 * @derives(master-plan §G)
 */
export const listComplaints = () =>
  fetchJson<{ complaints: ComplaintListItem[]; nextCursor: string | null }>('/complaints?limit=50');

/**
 * One worker row for the HR worker list.
 * @derives(master-plan §G)
 */
export type WorkerListItem = {
  workerId: string;
  userId: string | null;
  membershipId: string;
  status: string;
  /** 15-state lifecycle (ACTIVE, ON_LEAVE, DOC_PENDING, …) — drives STATE chip + filters. */
  state: string;
  podId: string | null;
  name: string | null;
  phone: string | null;
  anonymizedPhone: boolean;
  /** Most recent live assignment's site, or null if unassigned (DRAFT-only worker). */
  primarySite: { id: string; name: string } | null;
  createdAt: string;
};
/**
 * One assignment row in a worker's detail bundle.
 * @derives(master-plan §G)
 */
export type WorkerAssignment = {
  siteId: string;
  siteName: string;
  shiftStart: string;
  shiftEnd: string;
  dayMask: string;
  validFrom: string;
  validUntil: string | null;
  state: string;
};
/**
 * One leave row in a worker's detail bundle.
 * @derives(master-plan §G)
 */
export type WorkerLeaveRow = {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string;
  state: string;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
};
/**
 * One audit row in a worker's detail bundle.
 * @derives(master-plan §G)
 */
export type WorkerAuditRow = {
  id: string;
  kind: string;
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};
/**
 * Worker detail = list shape + the full read bundle (profile, shifts, attendance, leave, audit).
 * @derives(master-plan §G)
 */
export type WorkerDetailItem = WorkerListItem & {
  preferredLanguage: string;
  salaryPaise: number | null;
  bankIfsc: string | null;
  bankAcct: string | null;
  joinedAt: string;
  assignments: WorkerAssignment[];
  attendance: {
    month: string;
    summary: { present: number; absent: number; leave: number; half: number };
    days: Record<string, string>;
  };
  leave: WorkerLeaveRow[];
  audit: WorkerAuditRow[];
};

/**
 * Fetch the worker list (GET /admin/workers).
 * @derives(master-plan §G)
 */
export const listWorkers = () => fetchJson<Paged<WorkerListItem>>('/admin/workers?limit=50');
/**
 * Fetch one worker's detail bundle (GET /admin/workers/:id).
 * @derives(master-plan §G)
 */
export const getWorker = (id: string) => fetchJson<WorkerDetailItem>(`/admin/workers/${id}`);

/** Sidebar count badges (pending leave + open complaints). Best-effort: a
 * transient backend blip yields no badges rather than blanking the shell.
 * @derives(master-plan §G) */
export async function getNavBadges(): Promise<Record<string, number>> {
  try {
    const [leave, complaints] = await Promise.all([listPendingLeave(), listComplaints()]);
    return {
      leave: leave.items.length,
      complaints: complaints.complaints.filter((c) => c.state === 'OPEN' || c.state === 'IN_HR')
        .length,
    };
  } catch {
    return {};
  }
}

/**
 * One activity-feed row on the HR overview.
 * @derives(master-plan §G)
 */
export type OverviewActivity = {
  id: string;
  kind: string;
  actorId: string;
  targetId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};
/**
 * One site summary row on the HR overview.
 * @derives(master-plan §G)
 */
export type OverviewSite = {
  id: string;
  name: string;
  state: string;
  workers: number;
  supervisors: number;
};
/**
 * The whole HR overview payload.
 * @derives(master-plan §G)
 */
export type Overview = {
  counts: {
    leave: number;
    complaints: number;
    oldestLeaveAt: string | null;
    oldestComplaintAt: string | null;
    hasHighComplaint: boolean;
  };
  today: { onSite: number; noShow: number; onLeave: number; flagged: number };
  visits: { verified: number; flagged: number; total: number };
  sites: OverviewSite[];
  activity: OverviewActivity[];
};

/** The entire HR dashboard in one real backend call (GET /hr/overview).
 * @derives(master-plan §G) */
export const getOverview = () => fetchJson<Overview>('/hr/overview');

/**
 * Today's coverage pulse counters.
 * @derives(master-plan §G)
 */
export type TodayPulse = {
  onSite: number;
  late: number;
  noShow: number;
  onLeave: number;
  flagged: number;
  asOf: string;
};
/**
 * One site row on today's coverage board.
 * @derives(master-plan §G)
 */
export type TodaySite = {
  siteId: string;
  site: string;
  assigned: number;
  present: number;
  absentNoCall: number;
  onLeave: number;
  uncovered: number;
  flagged: number;
};
/**
 * One no-show row on today's coverage board.
 * @derives(master-plan §G)
 */
export type TodayNoShow = { worker: string; site: string; since: string; supervisor: string };
/**
 * The whole today coverage board payload.
 * @derives(master-plan §G)
 */
export type TodayBoard = { pulse: TodayPulse; sites: TodaySite[]; noShows: TodayNoShow[] };

/** Live coverage across owned sites (GET /hr/today).
 * @derives(master-plan §G) */
export const getToday = () => fetchJson<TodayBoard>('/hr/today');

/**
 * One enriched pending-leave row on the Leave screen.
 * @derives(master-plan §G)
 */
export type LeavePending = {
  id: string;
  workerId: string;
  name: string;
  phone: string;
  site: string;
  fromDate: string;
  toDate: string;
  reason: string;
  createdAt: string;
  present30: number;
  leave90: number;
  activeSince: string;
  overlap: number;
};
/**
 * One decided-leave history row on the Leave screen.
 * @derives(master-plan §G)
 */
export type LeaveHistory = {
  id: string;
  workerId: string;
  name: string;
  phone: string;
  fromDate: string;
  toDate: string;
  reason: string;
  state: string;
  decidedAt: string | null;
  decidedByName: string;
  decidedByYou: boolean;
  note: string | null;
};
/**
 * The whole Leave screen payload.
 * @derives(master-plan §G)
 */
export type LeaveData = { pending: LeavePending[]; history: LeaveHistory[] };

/** Whole Leave screen — pending (enriched) + decided history (GET /hr/leave).
 * @derives(master-plan §G) */
export const getLeave = () => fetchJson<LeaveData>('/hr/leave');

/**
 * One complaint row on the HR Complaints screen.
 * @derives(master-plan §G)
 */
export type ComplaintRow = {
  id: string;
  siteId: string;
  siteName: string;
  supervisorId: string;
  supervisorName: string;
  kind: string;
  severity: string;
  state: string;
  text: string;
  unreadHrRepliesCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
/**
 * One message in a complaint thread.
 * @derives(master-plan §G)
 */
export type ComplaintMessage = {
  id: string;
  authorUserId: string;
  authorRole: string;
  authorName: string;
  body: string;
  createdAt: string;
};
/**
 * One complaint plus its full message thread.
 * @derives(master-plan §G)
 */
export type ComplaintDetail = {
  complaint: ComplaintRow & { resolvedBy: string | null };
  messages: ComplaintMessage[];
};

/** Complaints list, name-enriched + HR-site-scoped (GET /hr/complaints).
 * @derives(master-plan §G) */
export const getComplaints = () => fetchJson<{ complaints: ComplaintRow[] }>('/hr/complaints');
/** One complaint + its full thread (GET /hr/complaints/:id).
 * @derives(master-plan §G) */
export const getComplaint = (id: string) => fetchJson<ComplaintDetail>(`/hr/complaints/${id}`);

/**
 * One row in the HR audit ledger.
 * @derives(master-plan §G)
 */
export type AuditEvent = {
  id: string;
  kind: string;
  icon: string;
  text: string;
  actor: string | null;
  targetId: string | null;
  createdAt: string;
};
/**
 * One flagged visit on the Record screen.
 * @derives(master-plan §G)
 */
export type FlaggedVisit = {
  id: string;
  worker: string;
  site: string;
  state: string;
  scheduledFor: string;
  verificationText: string | null;
  photosBefore: number;
  photosAfter: number;
};
/**
 * The whole Record screen payload.
 * @derives(master-plan §G)
 */
export type AuditData = { events: AuditEvent[]; flaggedVisits: FlaggedVisit[] };

/** Record screen — audit ledger + flagged visits (GET /hr/audit).
 * @derives(master-plan §G) */
export const getAudit = () => fetchJson<AuditData>('/hr/audit');

/**
 * One worker's payroll row for the month.
 * @derives(master-plan §G)
 */
export type PayrollRow = {
  workerId: string;
  worker: string;
  site: string;
  basePaise: number;
  presentDays: number;
  deductPaise: number;
  netPaise: number;
  notReady: boolean;
  deductionDays: { date: string; status: string; deductPaise: number }[];
};
/**
 * The whole Payroll screen payload.
 * @derives(master-plan §G)
 */
export type PayrollData = {
  month: string;
  rows: PayrollRow[];
  totals: { base: number; deduct: number; net: number };
};

/** Payroll screen — base − deductions per worker for the month (GET /hr/payroll).
 * @derives(master-plan §G) */
export const getPayroll = () => fetchJson<PayrollData>('/hr/payroll');

/**
 * One member row on the Team screen.
 * @derives(master-plan §G)
 */
export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  sites: number;
  added: string;
  isMe: boolean;
};

/** Team — HR + supervisors connected to owned sites (GET /hr/team).
 * @derives(master-plan §G) */
export const getTeam = () => fetchJson<{ members: TeamMember[] }>('/hr/team');

/**
 * One team member's full detail payload.
 * @derives(master-plan §G)
 */
export type TeamMemberDetail = {
  userId: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  salaryPaise: number | null;
  bankAcctLast4: string | null;
  /** Site names owned (HR/OWNER), else null. */
  owns: string[] | null;
  /** Site bindings (SUPERVISOR), else null. */
  bindings: { site: string; type: string; from: string; until: string | null }[] | null;
};

/** One team member's detail — profile + salary + sites/bindings (GET /hr/team/:userId).
 * @derives(master-plan §G) */
export const getTeamMember = (userId: string) =>
  fetchJson<TeamMemberDetail>(`/hr/team/${encodeURIComponent(userId)}`);

/**
 * One roster row on a site's detail screen.
 * @derives(master-plan §G)
 */
export type SiteRosterRow = {
  workerId: string;
  name: string;
  phone: string;
  status: string;
  state: string;
};
/**
 * One supervisor binding on a site's detail screen.
 * @derives(master-plan §G)
 */
export type SiteBinding = {
  id: string;
  name: string;
  phone: string;
  type: string;
  from: string;
  until: string | null;
  ended: string | null;
};
/**
 * The whole site-detail screen payload.
 * @derives(master-plan §G)
 */
export type SiteDetailData = {
  site: {
    id: string;
    name: string;
    state: string;
    address: string | null;
    latitude: string | null;
    longitude: string | null;
    workdays: string;
    createdAt: string;
  };
  today: { assigned: number; present: number; absentNoCall: number; uncovered: number };
  roster: SiteRosterRow[];
  bindings: SiteBinding[];
};

/** One owned site + roster + supervisors + today (GET /hr/sites/:id).
 * @derives(master-plan §G) */
export const getSiteDetail = (id: string) => fetchJson<SiteDetailData>(`/hr/sites/${id}`);

/**
 * One policy key's current value row.
 * @derives(master-plan §G)
 */
export type PolicyRow = {
  key: string;
  value: unknown;
  /** DB category enum (sla|notification|worker|hr|ai|owner|handoff) — echoed back on edit. */
  category: string;
  setByName: string;
  setAt: string;
  /** Whether the caller's role may append a new value (write ACL). */
  editable: boolean;
};
/**
 * One historical value row for a policy key.
 * @derives(master-plan §G)
 */
export type PolicyHistoryRow = {
  value: unknown;
  previousValueSnapshot: unknown;
  setByName: string;
  setAt: string;
};

/** Current value per policy key, append-only (GET /admin/policy).
 * @derives(master-plan §G) */
export const getPolicies = () => fetchJson<{ policies: PolicyRow[] }>('/admin/policy');
/** Append-only history for one key, newest first (GET /admin/policy/:key/history).
 * @derives(master-plan §G) */
export const getPolicyHistory = (key: string) =>
  fetchJson<{ history: PolicyHistoryRow[] }>(`/admin/policy/${encodeURIComponent(key)}/history`);

/**
 * One published update row on the Updates screen.
 * @derives(master-plan §G)
 */
export type UpdateRow = {
  id: string;
  /** GENERAL | POLICY_CHANGE | URGENT_NOTICE | PAYROLL_REMINDER — doubles as the title. */
  kind: string;
  content: string;
  /** null = company-wide; otherwise the targeted supervisor's User.id. */
  targetSupervisorId: string | null;
  targetSupervisorName: string | null;
  acknowledgmentRequired: boolean;
  /** HR prompt hint at create; replaced by the supervisor's typed words on ack. */
  acknowledgmentPhrase: string | null;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
};

/** The HR's published updates + ack status, newest first (GET /hr/updates).
 * @derives(master-plan §G) */
export const getUpdates = () => fetchJson<{ updates: UpdateRow[] }>('/hr/updates');

/**
 * Notification channel preferences toggles.
 * @derives(master-plan §G)
 */
export type NotificationPrefs = { push: boolean; whatsapp: boolean; email: boolean };
/**
 * The current account's settings payload.
 * @derives(master-plan §G)
 */
export type MeSettings = {
  user: { name: string | null; phone: string; locale: string };
  activeCompany: { name: string } | null;
  activeRole: string;
  notificationPrefs: NotificationPrefs;
};

/** Current account: profile + active company/role + notification prefs (GET /me).
 * @derives(master-plan §G) */
export const getMeSettings = () => fetchJson<MeSettings>('/me');
