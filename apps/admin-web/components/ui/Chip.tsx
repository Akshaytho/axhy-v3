import type { ReactNode } from 'react';

/**
 * Tone chip — the one status primitive. Pure render (server-safe).
 * @derives(master-plan §G)
 */
export function Chip({
  tone = 'neutral',
  dot = true,
  sm = false,
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'accent';
  dot?: boolean;
  sm?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`chip chip-${tone} ${sm ? 'chip-sm' : ''}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

// Worker/Site lifecycle → [label, tone]. Green=positive only, amber=attention,
// neutral=procedural/terminal (matches the v6 stateChip map + the state machines).
const STATE_CHIP: Record<string, [string, Parameters<typeof Chip>[0]['tone']]> = {
  INVITED: ['Invited', 'neutral'],
  PENDING_ACTIVATION: ['Activating', 'accent'],
  DOC_PENDING: ['Documents pending', 'warn'],
  ACTIVE: ['Active', 'ok'],
  ON_LEAVE: ['On leave', 'neutral'],
  ON_SUSPENSION: ['Suspended', 'warn'],
  ABSENT: ['Absent', 'warn'],
  AT_RISK: ['At risk', 'warn'],
  BLOCKED: ['Blocked', 'warn'],
  TRANSFER_PENDING: ['Transfer pending', 'neutral'],
  INACTIVE: ['Inactive', 'neutral'],
  TERMINATION_PENDING: ['Termination started', 'neutral'],
  TERMINATED: ['Terminated', 'neutral'],
  ARCHIVED: ['Archived', 'neutral'],
  ANONYMIZED: ['Anonymised', 'neutral'],
  DRAFT: ['Draft', 'neutral'],
};

/**
 * Worker/site lifecycle state rendered as a toned chip.
 * @derives(master-plan §G)
 */
export function StateChip({ state, sm }: { state: string; sm?: boolean }) {
  const [label, tone] = STATE_CHIP[state] ?? [state, 'neutral'];
  return (
    <Chip tone={tone} sm={sm}>
      {label}
    </Chip>
  );
}

// Complaint severity → [label, tone] (matches v6 SeverityChip).
const SEVERITY_CHIP: Record<string, [string, Parameters<typeof Chip>[0]['tone']]> = {
  HIGH: ['High', 'warn'],
  URGENT: ['Urgent', 'warn'],
  MEDIUM: ['Medium', 'warn'],
  LOW: ['Low', 'neutral'],
  NOTE: ['Note', 'neutral'],
};
/**
 * Complaint severity rendered as a toned chip.
 * @derives(master-plan §G)
 */
export function SeverityChip({ severity, sm }: { severity: string; sm?: boolean }) {
  const [label, tone] = SEVERITY_CHIP[severity] ?? [severity, 'neutral'];
  return (
    <Chip tone={tone} sm={sm}>
      {label}
    </Chip>
  );
}

// Complaint lifecycle → [label, tone] (matches v6 ComplaintStateChip).
const COMPLAINT_STATE_CHIP: Record<string, [string, Parameters<typeof Chip>[0]['tone']]> = {
  OPEN: ['Open', 'warn'],
  IN_HR: ['With HR', 'warn'],
  RESOLVED: ['Resolved', 'ok'],
  DISMISSED: ['Dismissed', 'neutral'],
};
/**
 * Complaint lifecycle state rendered as a toned chip.
 * @derives(master-plan §G)
 */
export function ComplaintStateChip({ state, sm }: { state: string; sm?: boolean }) {
  const [label, tone] = COMPLAINT_STATE_CHIP[state] ?? [state, 'neutral'];
  return (
    <Chip tone={tone} sm={sm}>
      {label}
    </Chip>
  );
}
