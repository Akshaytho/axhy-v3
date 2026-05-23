/**
 * @axhy/ai-tools — Redaction-before-embedding pipeline
 *
 * Two-stage content sanitization run before any text is embedded:
 *   1. stripTaggedBlocks() — removes XML-style tagged blocks (system reminders, private data, etc.)
 *   2. redactSecrets() — replaces API keys, tokens, and credential patterns with [REDACTED]
 *
 * Processing order is non-negotiable: strip → redact → embed → store redacted only.
 *
 * @derives(ADR-0022)
 */

// ─── Strip tagged blocks ──────────────────────────────────────────────────

const STRIP_TAGS = [
  'private',
  'system-reminder',
  'system_instruction',
  'system-instruction',
  'persisted-output',
  'claude-mem-context',
  'task-notification',
] as const;

const STRIP_REGEX = new RegExp(`<(${STRIP_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?</\\1>`, 'g');

export function stripTaggedBlocks(content: string): string {
  return content.replace(STRIP_REGEX, '');
}

// ─── Redact secret patterns ───────────────────────────────────────────────

const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/g,
  /xoxb-[A-Za-z0-9-]{20,}/g,
  /postgresql:\/\/[^@]+@[^\s]+/g,
  /AKIA[A-Z0-9]{16}/g,
  /eyJ[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
];

const REDACTED = '[REDACTED]';

export function redactSecrets(content: string): string {
  let result = content;
  for (const pattern of SECRET_PATTERNS) {
    const fresh = new RegExp(pattern.source, pattern.flags);
    result = result.replace(fresh, REDACTED);
  }
  return result;
}

// ─── Combined pipeline ───────────────────────────────────────────────────

export function redact(content: string): string {
  return redactSecrets(stripTaggedBlocks(content));
}

// ─── Exports for testing ─────────────────────────────────────────────────

export { STRIP_TAGS, SECRET_PATTERNS };
