/**
 * @axhy/errors
 *
 * Centralized error catalog. Every error has a stable code, a customer-facing
 * message (translated via @axhy/copy), an internal reason, and a runbook link.
 *
 * @derives(ADR-0018)
 */

export const PACKAGE_NAME = '@axhy/errors' as const;

export class AxhyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AxhyError';
  }
}
