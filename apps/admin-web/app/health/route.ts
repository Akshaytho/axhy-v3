/**
 * GET /health — Railway healthcheck target for the admin-web service.
 *
 * railway.json is SHARED across services ($RAILWAY_SERVICE_NAME), so its
 * `healthcheckPath: "/health"` applies to admin-web too — without this route
 * every admin-web deploy would fail its healthcheck. The backend has its own
 * deeper /health (postgres+redis pings, server.ts:191-214); a marketing/portal
 * frontend is healthy when it can serve a response at all.
 *
 * @derives(findings 2026-06-10 O2 — healthcheckPath wiring)
 */

/**
 * Healthcheck handler — returns 200 so Railway routes traffic to this replica.
 * @derives(master-plan §G) — operational readiness (findings 2026-06-10 O2)
 */
export function GET(): Response {
  return Response.json({ ok: true, service: 'admin-web', ts: new Date().toISOString() });
}
