/**
 * Updates presentation constants — the v6 oversight2.jsx UPDATE_KINDS and the
 * default compose templates. Kind is the supervisor-facing title (there is no
 * separate title field). Templates are a client convenience persisted in
 * localStorage; these are the seed defaults.
 */

/**
 * The supervisor-facing update kinds as [value, label] pairs, in v6 order.
 * @derives(master-plan §G)
 */
export const UPDATE_KINDS: [string, string][] = [
  ['GENERAL', 'General'],
  ['POLICY_CHANGE', 'Policy change'],
  ['URGENT_NOTICE', 'Urgent notice'],
  ['PAYROLL_REMINDER', 'Payroll reminder'],
];

/**
 * Resolve an update kind value to its display label, falling back to the value.
 * @derives(master-plan §G)
 */
export const updateKindLabel = (k: string): string =>
  (UPDATE_KINDS.find((x) => x[0] === k) ?? [k, k])[1];

/**
 * A reusable compose template persisted in localStorage.
 * @derives(master-plan §G)
 */
export type UpdateTemplate = { id: string; kind: string; content: string };

/**
 * Seed compose templates used as the localStorage defaults.
 * @derives(master-plan §G)
 */
export const DEFAULT_UPDATE_TEMPLATES: UpdateTemplate[] = [
  {
    id: 'tpl_1',
    kind: 'PAYROLL_REMINDER',
    content: 'Payroll closes on the 28th. Please make sure all attendance is recorded by then.',
  },
  {
    id: 'tpl_2',
    kind: 'GENERAL',
    content: 'Wishing everyone a happy festival. Please confirm your weekend cover arrangements.',
  },
];
