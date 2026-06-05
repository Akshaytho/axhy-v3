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

/** Backend HTTP endpoints the mobile app calls via `apiFetch`.
 *  @derives(master-plan §G) */
export const API_ROUTES = {
  authOtpRequest: apiPath('auth', 'otp', 'request'),
  authOtpVerify: apiPath('auth', 'otp', 'verify'),
  authSignOut: apiPath('auth', 'sign-out'),
  me: apiPath('me'),
  workerConsent: apiPath('worker', 'consent'),
  workerHistory: apiPath('worker', 'history'),
  workerToday: apiPath('worker', 'today'),
  workerVisit: (visitId: string): string => apiPath('worker', 'visits', visitId),
  workerCapturesUploadUrls: apiPath('worker', 'captures', 'upload-urls'),
  workerCapturesUploadProxy: apiPath('worker', 'captures', 'upload'),
  workerSubmit: (visitId: string): string => apiPath('worker', 'visits', visitId, 'submit'),
  workerVerifyStatus: (visitId: string): string =>
    apiPath('worker', 'visits', visitId, 'verify-status'),
  workerClockIn: (visitId: string): string => apiPath('worker', 'visits', visitId, 'clock-in'),
  workerClockOut: (visitId: string): string => apiPath('worker', 'visits', visitId, 'clock-out'),
  // Worker self-service time-off. A worker POSTs their own Worker.id; the
  // backend binds the caller to self (403 otherwise). HR/supervisor decide.
  leaveRequests: apiPath('leave-requests'),
} as const;

/** Capture-flow step names, in the order the worker traverses them.
 *  @derives(WORKER_MVP_SLICE_2A_PLAN.md §7) */
export const CAPTURE_STEPS = [
  'qr-scan',
  'before-photos',
  'before-photos-review',
  'timer',
  'after-photos',
  'after-photos-review',
  'review',
  'submit',
] as const;

export type CaptureStep = (typeof CAPTURE_STEPS)[number];

/** Expo Router screen paths used by `router.push` / `router.replace`.
 *  @derives(master-plan §G) */
export const NAV_ROUTES = {
  authPhone: navPath('(auth)', 'phone'),
  authOtp: navPath('(auth)', 'otp'),
  authPermissions: navPath('(auth)', 'permissions'),
  authConsent: navPath('(auth)', 'consent'),
  workerHome: navPath('(worker)'),
  workerVisitDetail: (visitId: string): string => navPath('(worker)', 'visit', visitId),
  workerCaptureStep: (visitId: string, step: CaptureStep): string =>
    navPath('(worker)', 'capture', visitId, step),
  workerCaptureEntry: (visitId: string): string =>
    navPath('(worker)', 'capture', visitId, 'qr-scan'),
  workerLeaveRequest: navPath('(worker)', 'leave-request'),
  supervisorMe: navPath('(supervisor)', 'me'),
} as const;
