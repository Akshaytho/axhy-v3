# Axhy Boot Cleanup — 2026-06-02

## Root cause fixed outside the repo

The biggest remaining boot-token drain was not in `axhy-v3`. It came from the external `claude-mem` plugin hook:

- file: `~/.claude/plugins/marketplaces/thedotmack/plugin/hooks/hooks.json`
- hook removed: `SessionStart` command that ran `worker-service.cjs hook claude-code context`

That hook was auto-injecting a large recent-context dump at session start, which polluted new sessions before real task work began.

## External settings tightened

File: `~/.claude-mem/settings.json`

Changed:

- `CLAUDE_MEM_CONTEXT_OBSERVATIONS`: `50` -> `10`
- `CLAUDE_MEM_CONTEXT_SESSION_COUNT`: `10` -> `3`
- `CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY`: `true` -> `false`
- `CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT`: `true` -> `false`
- `CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT`: `true` -> `false`

## Repo-side cleanup shipped

- `handoff/NEXT_SESSION.md` is now the single rolling handoff file
- deleted `handoff/NEXT_SESSION_2026-06-01-pm.md`
- deleted `handoff/STATUS.md`
- deleted `handoff/README.md`
- slimmed workspace `AGENTS.md`
- audit now enforces the one-file handoff contract

## Verification

- `./packages/ai-tools/node_modules/.bin/tsx packages/ai-tools/src/session-audit.ts`
- `./node_modules/.bin/tsc -p packages/ai-tools/tsconfig.json --noEmit`

Audit result after repo-side cleanup: no blockers or high violations. Remaining findings were unrelated medium issues.

## Usage evidence captured

Measured Claude CLI calls in this session:

- call 1: `3` input, `4` output, `20198` cache create, `13213` cache read, `$0.0798`
- call 2: `39` input, `3075` output, `39120` cache create, `141878` cache read, `$0.2947`

These are a floor, not the complete session total, because one earlier successful text-mode Claude critique did not expose usage metrics.
