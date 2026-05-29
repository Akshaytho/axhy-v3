/**
 * Phase 7B — Token Measurement Tool
 *
 * Reads Claude Code JSONL session files and reports:
 * - cost_pressure (fresh_input + cache_creation + output_tokens)
 * - context_pressure (avg cache_read per turn, delta, turn count)
 * - Status levels per Phase 7 spec thresholds
 *
 * Usage:
 *   pnpm --filter @axhy/ai-tools token:check
 *   pnpm --filter @axhy/ai-tools token:check -- /path/to/session.jsonl
 *
 * @derives(ADR-0024) — Phase 7 lean token operating discipline
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageBlock {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

interface ToolCall {
  name: string;
  contentLength: number;
}

interface SessionMetrics {
  sessionFile: string;
  turnsWithUsage: number;
  freshInput: number;
  cacheCreation: number;
  cacheRead: number;
  outputTokens: number;
  costPressure: number;
  avgCacheReadLast10: number;
  deltaCacheReadLast10: number;
  turnCount: number;
  toolCallCount: number;
  fullFileReads: number;
  largeOutputsInChat: number;
  costStatus: CostStatus;
  contextStatus: ContextStatus;
  perTurnCacheReads: number[];
}

type CostStatus = 'green' | 'yellow' | 'orange' | 'red' | 'black';
type ContextStatus = 'context_green' | 'context_yellow' | 'context_orange' | 'context_red';

// ---------------------------------------------------------------------------
// Thresholds (from Phase 7 spec — provisional, calibrate after validation)
// ---------------------------------------------------------------------------

const COST_THRESHOLDS: Array<{ max: number; status: CostStatus }> = [
  { max: 2_000_000, status: 'green' },
  { max: 4_000_000, status: 'yellow' },
  { max: 6_000_000, status: 'orange' },
  { max: 8_000_000, status: 'red' },
];

const CONTEXT_THRESHOLDS: Array<{ max: number; status: ContextStatus }> = [
  { max: 80_000, status: 'context_green' },
  { max: 150_000, status: 'context_yellow' },
  { max: 250_000, status: 'context_orange' },
];

// ---------------------------------------------------------------------------
// Core parsing
// ---------------------------------------------------------------------------

export function parseJsonlLine(line: string): {
  usage?: UsageBlock;
  toolCalls: ToolCall[];
  toolResultLength: number;
} {
  const result: { usage?: UsageBlock; toolCalls: ToolCall[]; toolResultLength: number } = {
    toolCalls: [],
    toolResultLength: 0,
  };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return result;
  }

  const message = parsed['message'] as Record<string, unknown> | undefined;
  if (!message) return result;

  // Extract usage
  const usage = message['usage'] as Record<string, unknown> | undefined;
  if (usage && typeof usage['output_tokens'] === 'number') {
    result.usage = {
      input_tokens: (usage['input_tokens'] as number) ?? 0,
      cache_creation_input_tokens: (usage['cache_creation_input_tokens'] as number) ?? 0,
      cache_read_input_tokens: (usage['cache_read_input_tokens'] as number) ?? 0,
      output_tokens: (usage['output_tokens'] as number) ?? 0,
    };
  }

  // Extract tool calls and results from content array
  const content = message['content'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block['type'] === 'tool_use') {
        const name = (block['name'] as string) ?? 'unknown';
        const input = block['input'];
        const inputStr = input ? JSON.stringify(input) : '';
        result.toolCalls.push({ name, contentLength: inputStr.length });
      }
      if (block['type'] === 'tool_result') {
        const resultContent = block['content'];
        const len =
          typeof resultContent === 'string'
            ? resultContent.length
            : Array.isArray(resultContent)
              ? JSON.stringify(resultContent).length
              : 0;
        result.toolResultLength += len;
      }
    }
  }

  return result;
}

export function classifyCostStatus(costPressure: number): CostStatus {
  for (const t of COST_THRESHOLDS) {
    if (costPressure <= t.max) return t.status;
  }
  return 'black';
}

export function classifyContextStatus(avgCacheReadPerTurn: number): ContextStatus {
  for (const t of CONTEXT_THRESHOLDS) {
    if (avgCacheReadPerTurn <= t.max) return t.status;
  }
  return 'context_red';
}

export function computeAvgLast10(values: number[]): number {
  if (values.length === 0) return 0;
  const last10 = values.slice(-10);
  return Math.round(last10.reduce((a, b) => a + b, 0) / last10.length);
}

export function computeDeltaLast10(values: number[]): number {
  if (values.length < 2) return 0;
  const last10 = values.slice(-10);
  if (last10.length < 2) return 0;
  return last10[last10.length - 1]! - last10[0]!;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

export function analyzeSession(filePath: string): SessionMetrics {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  let freshInput = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let outputTokens = 0;
  let turnsWithUsage = 0;
  let toolCallCount = 0;
  let fullFileReads = 0;
  let largeOutputsInChat = 0;
  const perTurnCacheReads: number[] = [];

  for (const line of lines) {
    const { usage, toolCalls, toolResultLength } = parseJsonlLine(line);

    if (usage) {
      turnsWithUsage++;
      freshInput += usage.input_tokens;
      cacheCreation += usage.cache_creation_input_tokens;
      cacheRead += usage.cache_read_input_tokens;
      outputTokens += usage.output_tokens;
      perTurnCacheReads.push(usage.cache_read_input_tokens);
    }

    for (const tc of toolCalls) {
      toolCallCount++;
      if (tc.name === 'Read' || tc.name === 'read_file') {
        fullFileReads++;
      }
    }

    if (toolResultLength > 2000) {
      largeOutputsInChat++;
    }
  }

  const costPressure = freshInput + cacheCreation + outputTokens;
  const avgCacheReadLast10 = computeAvgLast10(perTurnCacheReads);
  const deltaCacheReadLast10 = computeDeltaLast10(perTurnCacheReads);

  return {
    sessionFile: basename(filePath),
    turnsWithUsage,
    freshInput,
    cacheCreation,
    cacheRead,
    outputTokens,
    costPressure,
    avgCacheReadLast10,
    deltaCacheReadLast10,
    turnCount: turnsWithUsage,
    toolCallCount,
    fullFileReads,
    largeOutputsInChat,
    costStatus: classifyCostStatus(costPressure),
    contextStatus: classifyContextStatus(avgCacheReadLast10),
    perTurnCacheReads,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function statusIcon(status: string): string {
  if (status.includes('green')) return '\u{1F7E2}';
  if (status.includes('yellow')) return '\u{1F7E1}';
  if (status.includes('orange')) return '\u{1F7E0}';
  if (status.includes('red')) return '\u{1F534}';
  if (status.includes('black')) return '⚫';
  return '❓';
}

export function formatReport(m: SessionMetrics): string {
  const lines = [
    `── Token Check: ${m.sessionFile} ──`,
    ``,
    `  turns:           ${m.turnCount}`,
    `  tool_calls:      ${m.toolCallCount}`,
    `  full_file_reads: ${m.fullFileReads}`,
    `  large_outputs:   ${m.largeOutputsInChat}`,
    ``,
    `  fresh_input:     ${fmt(m.freshInput)}`,
    `  cache_creation:  ${fmt(m.cacheCreation)}`,
    `  cache_read:      ${fmt(m.cacheRead)}`,
    `  output_tokens:   ${fmt(m.outputTokens)}`,
    ``,
    `  cost_pressure:   ${fmt(m.costPressure)}  ${statusIcon(m.costStatus)} ${m.costStatus}`,
    `  context (avg/10): ${fmt(m.avgCacheReadLast10)}/turn  ${statusIcon(m.contextStatus)} ${m.contextStatus}`,
    `  context (delta):  ${fmt(m.deltaCacheReadLast10)} over last 10 turns`,
  ];

  // Action recommendations
  const actions: string[] = [];
  if (m.costStatus === 'yellow')
    actions.push('Avoid full-file reads. Redirect large outputs to files.');
  if (m.costStatus === 'orange') actions.push('Write checkpoint. Move evidence out of chat.');
  if (m.costStatus === 'red')
    actions.push('Finish current task, write handoff, start fresh session.');
  if (m.costStatus === 'black') actions.push('STOP. Emergency/security only.');
  if (m.contextStatus === 'context_yellow')
    actions.push('Context growing. Prefer line-range reads.');
  if (m.contextStatus === 'context_orange')
    actions.push('Context high. Checkpoint and redirect all large outputs.');
  if (m.contextStatus === 'context_red')
    actions.push('Context critical. Finish task and start fresh session.');
  if (m.largeOutputsInChat > 0)
    actions.push(`${m.largeOutputsInChat} large outputs in chat — redirect to evidence files.`);

  if (actions.length > 0) {
    lines.push('');
    lines.push('  actions:');
    for (const a of actions) {
      lines.push(`    • ${a}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function findMostRecentJsonl(): string | null {
  const projectDir = join(homedir(), '.claude', 'projects', '-Users-thotaakshay-eclean-workspace');
  let files: string[];
  try {
    files = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return null;
  }

  let newest: string | null = null;
  let newestTime = 0;
  for (const f of files) {
    const fullPath = join(projectDir, f);
    const stat = statSync(fullPath);
    if (stat.mtimeMs > newestTime) {
      newestTime = stat.mtimeMs;
      newest = fullPath;
    }
  }
  return newest;
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  let filePath = args[0];

  if (!filePath) {
    filePath = findMostRecentJsonl() ?? '';
    if (!filePath) {
      console.error('No JSONL file found. Pass a path as argument.');
      process.exit(1);
    }
  }

  try {
    const metrics = analyzeSession(filePath);
    console.log(formatReport(metrics));
  } catch (err) {
    console.error(
      `Failed to analyze ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

// Only run when executed directly, not when imported by tests
if (process.argv[1] && /token-check/.test(process.argv[1])) {
  main();
}
