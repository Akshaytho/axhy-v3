/**
 * Phase 7B — Token Measurement Tool Tests
 *
 * Covers:
 * - JSONL line parsing (usage extraction, tool call detection)
 * - cost_pressure computation from known values
 * - context_pressure avg/delta computation
 * - Threshold classification for all status levels
 * - Edge cases (no usage, malformed lines)
 *
 * @derives(axhy-cognitive-system/docs/superpowers/specs/2026-05-27-axhy-lean-token-operating-discipline.md)
 */

import { describe, it, expect } from 'vitest';

import {
  parseJsonlLine,
  classifyCostStatus,
  classifyContextStatus,
  computeAvgLast10,
  computeDeltaLast10,
} from './token-check.js';

// ---------------------------------------------------------------------------
// Helpers — build JSONL lines matching real Claude Code format
// ---------------------------------------------------------------------------

function makeUsageLine(usage: {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}): string {
  return JSON.stringify({
    parentUuid: 'test-uuid',
    isSidechain: false,
    message: {
      model: 'claude-opus-4-6',
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      usage,
    },
  });
}

function makeToolUseLine(toolName: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    parentUuid: 'test-uuid',
    isSidechain: false,
    message: {
      model: 'claude-opus-4-6',
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_test',
          name: toolName,
          input,
        },
      ],
      stop_reason: 'tool_use',
      usage: {
        input_tokens: 1,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 5000,
        output_tokens: 50,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// parseJsonlLine
// ---------------------------------------------------------------------------

describe('parseJsonlLine', () => {
  it('extracts usage from a valid assistant message', () => {
    const line = makeUsageLine({
      input_tokens: 10,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 30000,
      output_tokens: 200,
    });

    const result = parseJsonlLine(line);
    expect(result.usage).toBeDefined();
    expect(result.usage?.input_tokens).toBe(10);
    expect(result.usage?.cache_creation_input_tokens).toBe(500);
    expect(result.usage?.cache_read_input_tokens).toBe(30000);
    expect(result.usage?.output_tokens).toBe(200);
  });

  it('returns no usage for non-message lines', () => {
    const line = JSON.stringify({ type: 'queue-operation', operation: 'enqueue' });
    const result = parseJsonlLine(line);
    expect(result.usage).toBeUndefined();
    expect(result.toolCalls).toHaveLength(0);
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseJsonlLine('not json at all {{{');
    expect(result.usage).toBeUndefined();
    expect(result.toolCalls).toHaveLength(0);
  });

  it('detects Read tool calls', () => {
    const line = makeToolUseLine('Read', { file_path: '/some/file.ts' });
    const result = parseJsonlLine(line);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe('Read');
  });

  it('detects multiple tool calls in one message', () => {
    const line = JSON.stringify({
      parentUuid: 'test',
      message: {
        content: [
          { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a.ts' } },
          { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } },
        ],
        usage: {
          input_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 10,
        },
      },
    });

    const result = parseJsonlLine(line);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]!.name).toBe('Read');
    expect(result.toolCalls[1]!.name).toBe('Bash');
  });

  it('returns usage even when there are no tool calls', () => {
    const line = makeUsageLine({
      input_tokens: 5,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 20000,
      output_tokens: 150,
    });

    const result = parseJsonlLine(line);
    expect(result.usage).toBeDefined();
    expect(result.toolCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// classifyCostStatus
// ---------------------------------------------------------------------------

describe('classifyCostStatus', () => {
  it('returns green for 0', () => {
    expect(classifyCostStatus(0)).toBe('green');
  });

  it('returns green for values up to 2M', () => {
    expect(classifyCostStatus(1_500_000)).toBe('green');
    expect(classifyCostStatus(2_000_000)).toBe('green');
  });

  it('returns yellow for values between 2M and 4M', () => {
    expect(classifyCostStatus(2_000_001)).toBe('yellow');
    expect(classifyCostStatus(3_500_000)).toBe('yellow');
    expect(classifyCostStatus(4_000_000)).toBe('yellow');
  });

  it('returns orange for values between 4M and 6M', () => {
    expect(classifyCostStatus(4_000_001)).toBe('orange');
    expect(classifyCostStatus(6_000_000)).toBe('orange');
  });

  it('returns red for values between 6M and 8M', () => {
    expect(classifyCostStatus(6_000_001)).toBe('red');
    expect(classifyCostStatus(8_000_000)).toBe('red');
  });

  it('returns black for values above 8M', () => {
    expect(classifyCostStatus(8_000_001)).toBe('black');
    expect(classifyCostStatus(50_000_000)).toBe('black');
  });
});

// ---------------------------------------------------------------------------
// classifyContextStatus
// ---------------------------------------------------------------------------

describe('classifyContextStatus', () => {
  it('returns context_green for low avg cache reads', () => {
    expect(classifyContextStatus(0)).toBe('context_green');
    expect(classifyContextStatus(50_000)).toBe('context_green');
    expect(classifyContextStatus(80_000)).toBe('context_green');
  });

  it('returns context_yellow for moderate avg cache reads', () => {
    expect(classifyContextStatus(80_001)).toBe('context_yellow');
    expect(classifyContextStatus(150_000)).toBe('context_yellow');
  });

  it('returns context_orange for high avg cache reads', () => {
    expect(classifyContextStatus(150_001)).toBe('context_orange');
    expect(classifyContextStatus(250_000)).toBe('context_orange');
  });

  it('returns context_red for very high avg cache reads', () => {
    expect(classifyContextStatus(250_001)).toBe('context_red');
    expect(classifyContextStatus(1_000_000)).toBe('context_red');
  });
});

// ---------------------------------------------------------------------------
// computeAvgLast10 / computeDeltaLast10
// ---------------------------------------------------------------------------

describe('computeAvgLast10', () => {
  it('returns 0 for empty array', () => {
    expect(computeAvgLast10([])).toBe(0);
  });

  it('computes average of fewer than 10 values', () => {
    expect(computeAvgLast10([100, 200, 300])).toBe(200);
  });

  it('uses only last 10 values when more exist', () => {
    const values = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
    ];
    // Last 10: 100..1000, avg = 550
    expect(computeAvgLast10(values)).toBe(550);
  });

  it('handles single value', () => {
    expect(computeAvgLast10([42000])).toBe(42000);
  });
});

describe('computeDeltaLast10', () => {
  it('returns 0 for empty array', () => {
    expect(computeDeltaLast10([])).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(computeDeltaLast10([100])).toBe(0);
  });

  it('computes delta from first to last of last 10', () => {
    expect(computeDeltaLast10([10, 20, 30])).toBe(20);
  });

  it('uses only last 10 values', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);
    // Last 10: 11000..20000, delta = 20000 - 11000 = 9000
    expect(computeDeltaLast10(values)).toBe(9000);
  });

  it('shows negative delta when context shrinks', () => {
    expect(computeDeltaLast10([300, 200, 100])).toBe(-200);
  });
});

// ---------------------------------------------------------------------------
// Integration: cost_pressure computation
// ---------------------------------------------------------------------------

describe('cost_pressure computation', () => {
  it('sums fresh_input + cache_creation + output_tokens correctly', () => {
    // Simulating what analyzeSession does
    const freshInput = 5000;
    const cacheCreation = 800_000;
    const outputTokens = 300_000;
    const costPressure = freshInput + cacheCreation + outputTokens;

    expect(costPressure).toBe(1_105_000);
    expect(classifyCostStatus(costPressure)).toBe('green');
  });

  it('a heavy session crosses into orange', () => {
    const freshInput = 10_000;
    const cacheCreation = 2_500_000;
    const outputTokens = 2_000_000;
    const costPressure = freshInput + cacheCreation + outputTokens;

    expect(costPressure).toBe(4_510_000);
    expect(classifyCostStatus(costPressure)).toBe('orange');
  });
});
