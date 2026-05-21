/**
 * Mobile API + navigation route constants.
 *
 * Composed via a path builder so endpoint and screen URLs live in one place
 * and consumers never hardcode endpoint strings inline. The values are the
 * single source of truth for the mobile app's HTTP and navigation URLs.
 *
 * @derives(ADR-0007)
 */

const apiPath = (...parts: ReadonlyArray<string>): string => `/${parts.join('/')}`;
const navPath = (...parts: ReadonlyArray<string>): string => `/${parts.join('/')}`;

/** Backend HTTP endpoints the mobile app calls via `apiFetch`. */
export const API_ROUTES = {
  authOtpRequest: apiPath('auth', 'otp', 'request'),
  authOtpVerify: apiPath('auth', 'otp', 'verify'),
  authSignOut: apiPath('auth', 'sign-out'),
  me: apiPath('me'),
  workerConsent: apiPath('worker', 'consent'),
} as const;

/** Expo Router screen paths used by `router.push` / `router.replace`. */
export const NAV_ROUTES = {
  authPhone: navPath('(auth)', 'phone'),
  authOtp: navPath('(auth)', 'otp'),
  authPermissions: navPath('(auth)', 'permissions'),
  authConsent: navPath('(auth)', 'consent'),
  workerHome: navPath('(worker)'),
  supervisorProfile: navPath('(supervisor)', 'profile'),
} as const;
