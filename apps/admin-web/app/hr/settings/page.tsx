/**
 * HR Settings route — /hr/settings. Fetches the caller's account (GET /me:
 * profile + active company/role + notification prefs) and renders the v6
 * SettingsScreen. Notification toggles persist via PATCH /me/notification-prefs;
 * language via PATCH /me/locale; sign-out via DELETE /api/auth/session. Auth
 * enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { getMeSettings } from '../../../features/hr/data';
import { SettingsScreen } from '../../../features/hr/settings/SettingsScreen';

export default async function HrSettingsPage() {
  const me = await getMeSettings();
  return <SettingsScreen me={me} />;
}
