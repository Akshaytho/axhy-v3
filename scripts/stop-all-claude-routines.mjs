#!/usr/bin/env node
/**
 * scripts/stop-all-claude-routines.mjs
 *
 * Lists every Claude Code remote routine ("scheduled remote agent") on the
 * authenticated user's account and DISABLES each one (sets enabled=false).
 *
 * The Claude Code API does not support DELETE for routines — only disable.
 * To fully remove a routine, visit https://claude.ai/code/routines after
 * running this script.
 *
 * Two ways to authenticate:
 *
 *   1. From inside a Claude Code session: ask Claude (the model) to invoke
 *      the RemoteTrigger tool. The OAuth token is added in-process and never
 *      exposed to scripts. This is the recommended way.
 *
 *   2. Standalone: set CLAUDE_CODE_OAUTH_TOKEN to a token from
 *      https://claude.ai/code/api-tokens (when/if Anthropic exposes that page),
 *      then run this script directly.
 *
 * Why this script exists: 2026-04-29 — founder noticed cost spike, wanted a
 * preventive tool. As of commit time, his account had ZERO routines, so this
 * script ran as a confirming no-op. Re-run any time you suspect a runaway
 * agent.
 *
 * @derives(docs/runbooks/runaway-claude-agents.md)
 */

const TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
const API_BASE = 'https://api.claude.ai/api/v1/code/triggers';

if (!TOKEN) {
  console.error('');
  console.error('  No CLAUDE_CODE_OAUTH_TOKEN env var set.');
  console.error('');
  console.error('  Use one of these instead:');
  console.error('');
  console.error('    A) Inside a Claude Code session, ask Claude (the model):');
  console.error('       "list and disable every Claude Code routine on my account"');
  console.error('       Claude will use the RemoteTrigger tool with auth handled in-process.');
  console.error('');
  console.error('    B) From the web UI: https://claude.ai/code/routines');
  console.error('       Toggle each routine to disabled or click delete.');
  console.error('');
  console.error('  This script remains here as a future fallback if Anthropic exposes');
  console.error('  static API tokens for Claude Code routines.');
  console.error('');
  process.exit(2);
}

async function api(path = '', init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

console.log('[stop-routines] Listing all Claude Code routines...');
const list = await api('');
const routines = list.data ?? [];

if (routines.length === 0) {
  console.log('[stop-routines] No routines found. Nothing to disable. Account is clean.');
  process.exit(0);
}

console.log(`[stop-routines] Found ${routines.length} routine(s):`);
for (const r of routines) {
  console.log(`  - ${r.id}  enabled=${r.enabled}  name=${JSON.stringify(r.name)}  schedule=${r.cron_expression ?? r.run_once_at ?? 'unknown'}`);
}

console.log('');
console.log('[stop-routines] Disabling all routines...');
for (const r of routines) {
  if (!r.enabled) {
    console.log(`  - ${r.id} already disabled, skipping`);
    continue;
  }
  try {
    await api(`/${r.id}`, {
      method: 'POST',
      body: JSON.stringify({ enabled: false }),
    });
    console.log(`  - ${r.id} disabled ✓`);
  } catch (err) {
    console.error(`  - ${r.id} FAILED: ${err.message}`);
  }
}
console.log('');
console.log('[stop-routines] Done. To permanently DELETE (not just disable), visit https://claude.ai/code/routines');
