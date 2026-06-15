import { fetchJson } from './api';

/**
 * Shape of GET /me used by the shell. Defensive — fields may be absent briefly.
 * @derives(master-plan §G)
 */
export type Me = {
  user: { name: string | null; phone: string };
  activeCompany: { name: string } | null;
  activeRole: string;
  availableRoles?: string[];
};

/**
 * Current signed-in identity + active company/role (server-only; cookie auth).
 * @derives(master-plan §G)
 */
export const getMe = () => fetchJson<Me>('/me');
