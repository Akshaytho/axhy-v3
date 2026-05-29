/**
 * Forbidden page — destination for sessions whose role does not have
 * access to the requested area. Reached via requireRole() redirect.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 13
 *
 * @derives(master-plan §G)
 */

/**
 * Static Access Denied page with a link back to /login.
 *
 * @derives(master-plan §G)
 */
export default function Forbidden() {
  return (
    <main style={{ padding: 64, textAlign: 'center' }}>
      <h1>Access denied</h1>
      <p>Your account does not have access to this area.</p>
      <p>
        <a href="/login">Return to login</a>
      </p>
    </main>
  );
}
