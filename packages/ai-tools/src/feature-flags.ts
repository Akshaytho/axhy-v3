/**
 * @axhy/ai-tools — Feature flags for v3 cognitive system
 *
 * Every phase ships behind a flag togglable in Railway env or local .env.
 * Flags are checked at runtime — no deploy needed to disable.
 *
 * @derives(ADR-0022)
 */

export const FEATURE_FLAGS = {
  IMPACT_CHECK_V2_ENABLED: 'IMPACT_CHECK_V2_ENABLED',
  PG_FTS_HYBRID_ENABLED: 'PG_FTS_HYBRID_ENABLED',
  FIELD_FANOUT_ENABLED: 'FIELD_FANOUT_ENABLED',
  REDACTION_STRICT_MODE: 'REDACTION_STRICT_MODE',
  ACTIVITY_CAPTURE_ENABLED: 'ACTIVITY_CAPTURE_ENABLED',
  LEARNED_EXCEPTIONS_ENABLED: 'LEARNED_EXCEPTIONS_ENABLED',
  TOKEN_ECONOMICS_INJECT: 'TOKEN_ECONOMICS_INJECT',
} as const;

const DEFAULTS: Record<string, boolean> = {
  [FEATURE_FLAGS.IMPACT_CHECK_V2_ENABLED]: false,
  [FEATURE_FLAGS.PG_FTS_HYBRID_ENABLED]: false,
  [FEATURE_FLAGS.FIELD_FANOUT_ENABLED]: false,
  [FEATURE_FLAGS.REDACTION_STRICT_MODE]: true,
  [FEATURE_FLAGS.ACTIVITY_CAPTURE_ENABLED]: false,
  [FEATURE_FLAGS.LEARNED_EXCEPTIONS_ENABLED]: false,
  [FEATURE_FLAGS.TOKEN_ECONOMICS_INJECT]: false,
};

export function isEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  const envVal = process.env[flag];
  if (envVal === 'true' || envVal === '1') return true;
  if (envVal === 'false' || envVal === '0') return false;
  return DEFAULTS[flag] ?? false;
}
