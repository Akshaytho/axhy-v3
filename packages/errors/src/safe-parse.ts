/**
 * `safeParseOrLog` — uniform pattern for "try to parse, log on failure,
 * return null instead of throwing."
 *
 * Replaces ad-hoc `if (!parsed.success) return ...` silent-drop patterns
 * scattered across the codebase. Every silent-drop site that adopts this
 * helper gets:
 *   - structured pino-compatible warn log (matches dispatcher conventions)
 *   - tenant-scoped context (`companyId`, `supervisorId`) when available
 *   - truncated raw payload (1KB) so logs stay readable in CI tail
 *   - no behavioral change at the call site (returns T | null, same shape)
 *
 * Duck-typed against zod's `safeParse` API so this package has zero
 * runtime deps on zod (consumers pass any object with `.safeParse()`).
 *
 * @derives(ADR-0018) — extends @axhy/errors error-handling discipline
 * @derives(master-plan §L) — bug-prevention: silent drops are a known
 *   failure mode of zod parse boundaries; structured warn breadcrumbs
 *   make schema-drift bugs detectable in production logs.
 */

/** Minimal logger interface — pino, fastify base log, console-shim all match. */
export type SafeParseLogger = {
  warn(obj: Record<string, unknown>, msg?: string): void;
};

/** Minimal "schema with safeParse" interface — zod's z.ZodSchema implements this. */
export type SafeParser<T> = {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: { message: string } };
};

/** Per-call context for log lines. All fields optional. */
export type SafeParseContext = {
  /** Stable name to group logs by (e.g., 'LivingDocRule', 'OpenAIToolArgs'). */
  schemaName: string;
  /** Tenant context for cross-tenant log filtering. */
  companyId?: string;
  /** Supervisor context. */
  supervisorId?: string;
  /** Free-form key for the call site (e.g., 'living-doc.coerceSection'). */
  callSite?: string;
};

const RAW_PAYLOAD_TRUNCATE_BYTES = 1024;

function truncateRaw(value: unknown): string {
  let str: string;
  try {
    str = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    str = '<unstringifiable>';
  }
  if (str.length <= RAW_PAYLOAD_TRUNCATE_BYTES) return str;
  return str.slice(0, RAW_PAYLOAD_TRUNCATE_BYTES) + `…[truncated, total ${str.length}B]`;
}

/**
 * Parse `value` with `parser`. On success returns the parsed data.
 * On failure logs a structured WARN with `ctx` and returns `null`.
 *
 * Use when the caller wants to *gracefully degrade* on bad input
 * (drop the malformed item, continue with the rest). NOT when bad
 * input should fail loudly — for that, use `parser.parse(value)` and
 * let the throw propagate.
 *
 * @derives(ADR-0018) — extends @axhy/errors error-handling discipline
 */
export function safeParseOrLog<T>(
  parser: SafeParser<T>,
  value: unknown,
  ctx: SafeParseContext,
  log: SafeParseLogger,
): T | null {
  const parsed = parser.safeParse(value);
  if (parsed.success) return parsed.data;
  log.warn(
    {
      event: 'safe_parse.failure',
      schema: ctx.schemaName,
      callSite: ctx.callSite,
      companyId: ctx.companyId,
      supervisorId: ctx.supervisorId,
      err: parsed.error.message,
      raw: truncateRaw(value),
    },
    `safeParseOrLog: ${ctx.schemaName} parse failed at ${ctx.callSite ?? '<unknown>'} — dropped`,
  );
  return null;
}
