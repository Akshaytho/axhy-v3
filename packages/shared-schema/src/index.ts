/**
 * @axhy/shared-schema
 *
 * The seed package. Single source of truth for database shape, validation,
 * and shared types across all apps and packages.
 *
 * @derives(ADR-0003)
 */

export const PACKAGE_NAME = '@axhy/shared-schema' as const;

export * from './zod/auth.js';
export * from './zod/me.js';
// F-006b 2026-05-21 — worker DPDP one-page consent
export * from './zod/worker-consent.js';
// Slice 2a-1 2026-05-21 — worker /today + /visits/:id read endpoints
export * from './zod/worker-today.js';
// Slice 2b-2 2026-05-22 — worker capture pipeline R2 presign batch
export * from './zod/worker-captures.js';
export * from './zod/supervisor.js';
export * from './zod/calendar.js';
export * from './zod/assignment.js';
export * from './zod/chat.js';
export * from './zod/living-doc.js';
// Layer 1 core primitives (workflow-design-closure 2026-05-15)
export * from './zod/audit-event.js';
export * from './zod/hr-pod.js';
export * from './zod/policy.js';
export * from './zod/notification.js';
export * from './zod/digest.js';
export * from './zod/site-supervisor-binding.js';
export * from './zod/audit-payloads.js';
// F-002.1 — unified decision-kind registry (single source of truth)
export * from './zod/supervisor-decision-kinds.js';
// F-004 — HandoffPackage payload (9 fields, schemaVersion: 1)
export * from './zod/handoff-package.js';
// Supervisor Today tab (panel-2026-05-17)
export * from './zod/today.js';
// Supervisor Activity feed (panel-2026-05-17 PM)
export * from './zod/activity.js';
// Supervisor Decisions tab — pending queue + dismiss write (panel-2026-05-17)
// @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
export * from './zod/decisions.js';
// Supervisor Context (Chat tab GreetingCard counts)
// @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
export * from './zod/supervisor-context.js';
// Supervisor Summary (end-of-day digest) — panel-2026-05-17
// @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
export * from './zod/summary.js';
// HR Updates tab — policy changes + typed-words ack
// @derives(ADR-0003) @derives(master-plan §G) — HR control plane / supervisor surface
export * from './zod/hr-updates.js';
// Wave 3 — Complaint threading + chat intent classifier
// @derives(supervisor-drawer-and-decisions-redesign.md §C)
// @derives(panel-2026-05-18) — Wave 3 backend
export * from './zod/complaint.js';
// Wave 1 — ReplacementInvite (F28) PUBG-squad replacement broadcast
// @derives(master-plan §P.4 — ReplacementInvite)
// @derives(replacement-invite-feature-spec.md, 2026-05-18)
export * from './zod/replacement-invite.js';
// Wave 4 — compliance flow: FlaggedReview Resolve/Reject + Activity Reverse/soft-flag
// @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
export * from './zod/wave-4-compliance.js';
// Slice 2b-3 2026-05-23 — worker submit + verify-status
export * from './zod/worker-submit.js';
// Wave-2-prep 2026-05-25 — admin/HR backend (ADR-0026 hiring authority)
export * from './zod/admin-memberships.js';
export * from './zod/admin-workers.js';
export * from './zod/admin-sites.js';
export * from './zod/admin-bindings.js';
// Super-admin-owner-bootstrap 2026-05-25 — POST /super-admin/memberships
export * from './zod/super-admin-memberships.js';
// Customer onboarding 2026-06-05 — POST /super-admin/companies
export * from './zod/super-admin-companies.js';
