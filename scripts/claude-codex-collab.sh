#!/usr/bin/env bash
#
# claude-codex-collab.sh
#
# Sequential broker for Claude Code and Codex working on the same repo
# without the user copy-pasting between tools.
#
# Design:
#   - Claude is the strategist/reviewer.
#   - Codex is the primary executor.
#   - They exchange structured notes through files in .agent-collab-runs/.
#   - They do NOT edit concurrently.
#
# Example:
#   ./scripts/claude-codex-collab.sh \
#     --goal "Fix boot token drain, broken MCP startup, and duplicated handoff flow permanently"
#
# Notes:
#   - This is text relay, not voice or live calls.
#   - Both CLIs must already be installed and authenticated.
#   - Claude CLI is resolved from PATH or ~/.local/bin/claude.
#   - Codex runs with workspace-write sandbox by default.
#
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  claude-codex-collab.sh --goal "..." [options]
  claude-codex-collab.sh --goal-file path/to/goal.md [options]

Options:
  --goal TEXT                 One-line or multi-sentence mission.
  --goal-file FILE            Read mission text from a file.
  --project-dir DIR           Repo/workspace root. Default: current directory.
  --rounds N                  Max Claude->Codex rounds. Default: 4.
  --claude-bin PATH           Claude CLI path. Default: PATH or ~/.local/bin/claude
  --codex-bin PATH            Codex CLI path. Default: PATH lookup
  --claude-model MODEL        Optional Claude model override.
  --codex-model MODEL         Optional Codex model override.
  --claude-budget USD         Optional Claude max budget per call.
  --codex-search              Enable Codex live web search.
  --codex-danger-full-access  Run Codex with danger-full-access sandbox.
  -h, --help                  Show help.

What it writes:
  .agent-collab-runs/<timestamp>/
    mission.md
    response.schema.json
    round-01-claude-prompt.md
    round-01-claude.json
    round-01-codex-prompt.md
    round-01-codex.json
    transcript.md
    FINAL_SUMMARY.md
EOF
}

have() {
  command -v "$1" >/dev/null 2>&1
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf -- '-> %s\n' "$*"
}

resolve_claude_bin() {
  if [[ -n "${CLAUDE_BIN:-}" ]]; then
    printf '%s\n' "$CLAUDE_BIN"
    return
  fi
  if have claude; then
    command -v claude
    return
  fi
  if [[ -x "$HOME/.local/bin/claude" ]]; then
    printf '%s\n' "$HOME/.local/bin/claude"
    return
  fi
  return 1
}

json_field() {
  local file="$1"
  local field="$2"
  python3 - "$file" "$field" <<'PY'
import json, sys
path, field = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
value = data.get(field)
if isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False))
elif value is None:
    print("")
else:
    print(str(value))
PY
}

pretty_json_to_md() {
  local title="$1"
  local src="$2"
  local dest="$3"
  {
    printf '## %s\n\n' "$title"
    printf '```json\n'
    python3 -m json.tool "$src"
    printf '```\n\n'
  } >> "$dest"
}

GOAL_TEXT=""
GOAL_FILE=""
PROJECT_DIR="$(pwd)"
ROUNDS=4
CLAUDE_BIN=""
CODEX_BIN="${CODEX_BIN:-}"
CLAUDE_MODEL=""
CODEX_MODEL=""
CLAUDE_BUDGET=""
CODEX_SEARCH=0
CODEX_SANDBOX="workspace-write"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --goal)
      GOAL_TEXT="${2:-}"
      shift 2
      ;;
    --goal-file)
      GOAL_FILE="${2:-}"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="${2:-}"
      shift 2
      ;;
    --rounds)
      ROUNDS="${2:-}"
      shift 2
      ;;
    --claude-bin)
      CLAUDE_BIN="${2:-}"
      shift 2
      ;;
    --codex-bin)
      CODEX_BIN="${2:-}"
      shift 2
      ;;
    --claude-model)
      CLAUDE_MODEL="${2:-}"
      shift 2
      ;;
    --codex-model)
      CODEX_MODEL="${2:-}"
      shift 2
      ;;
    --claude-budget)
      CLAUDE_BUDGET="${2:-}"
      shift 2
      ;;
    --codex-search)
      CODEX_SEARCH=1
      shift
      ;;
    --codex-danger-full-access)
      CODEX_SANDBOX="danger-full-access"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

[[ -d "$PROJECT_DIR" ]] || die "Project directory not found: $PROJECT_DIR"

if [[ -n "$GOAL_FILE" ]]; then
  [[ -f "$GOAL_FILE" ]] || die "Goal file not found: $GOAL_FILE"
  GOAL_TEXT="$(cat "$GOAL_FILE")"
fi

[[ -n "${GOAL_TEXT// }" ]] || die "Provide --goal or --goal-file"
[[ "$ROUNDS" =~ ^[0-9]+$ ]] || die "--rounds must be a positive integer"
(( ROUNDS >= 1 )) || die "--rounds must be >= 1"

CLAUDE_BIN="$(resolve_claude_bin)" || die "Claude CLI not found on PATH or ~/.local/bin/claude"
if [[ -n "$CODEX_BIN" ]]; then
  command -v "$CODEX_BIN" >/dev/null 2>&1 || die "Codex binary not found: $CODEX_BIN"
else
  have codex || die "Codex CLI not found on PATH"
  CODEX_BIN="$(command -v codex)"
fi

RUN_ROOT="$PROJECT_DIR/.agent-collab-runs"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$RUN_ROOT/$STAMP"
mkdir -p "$RUN_DIR"

MISSION_FILE="$RUN_DIR/mission.md"
TRANSCRIPT_FILE="$RUN_DIR/transcript.md"
FINAL_SUMMARY_FILE="$RUN_DIR/FINAL_SUMMARY.md"
SCHEMA_FILE="$RUN_DIR/response.schema.json"

cat > "$MISSION_FILE" <<EOF
$GOAL_TEXT
EOF

cat > "$SCHEMA_FILE" <<'EOF'
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["continue", "done", "blocked"]
    },
    "summary": {
      "type": "string"
    },
    "findings": {
      "type": "array",
      "items": { "type": "string" }
    },
    "next_actions": {
      "type": "array",
      "items": { "type": "string" }
    },
    "message_for_other_agent": {
      "type": "string"
    }
  },
  "required": [
    "status",
    "summary",
    "findings",
    "next_actions",
    "message_for_other_agent"
  ],
  "additionalProperties": false
}
EOF

CLAUDE_SCHEMA_INLINE="$(tr -d '\n' < "$SCHEMA_FILE")"

cat > "$TRANSCRIPT_FILE" <<EOF
# Claude <-> Codex Collaboration Transcript

- Project: $PROJECT_DIR
- Started: $(date)
- Max rounds: $ROUNDS
- Claude binary: $CLAUDE_BIN
- Codex binary: $CODEX_BIN

## Mission

\`\`\`
$GOAL_TEXT
\`\`\`

EOF

run_claude() {
  local round="$1"
  local prev_codex_json="$2"
  local prompt_file="$RUN_DIR/round-${round}-claude-prompt.md"
  local output_file="$RUN_DIR/round-${round}-claude.json"

  cat > "$prompt_file" <<EOF
You are Claude Code collaborating with Codex on the same local repository.

Repository:
$PROJECT_DIR

Your role:
- Strategist, reviewer, and critic.
- Do not be polite for the sake of politeness.
- Be specific, practical, and brief.
- Prefer durable fixes over temporary patches.
- If the current approach is structurally wrong, say so clearly.

Mission:
$GOAL_TEXT

Rules for this round:
- Read the repo directly if needed.
- Assume Codex is the primary executor.
- Give Codex the smallest high-value next step, not a giant wishlist.
- Focus on permanent fixes, root causes, missing verification, and architectural drift.

EOF

  if [[ -f "$prev_codex_json" ]]; then
    {
      printf '\nLatest Codex note:\n\n```json\n'
      cat "$prev_codex_json"
      printf '\n```\n'
    } >> "$prompt_file"
  else
    printf '\nNo prior Codex note exists yet. Start with the best plan/review for this mission.\n' >> "$prompt_file"
  fi

  info "Round $round: Claude review"
  local args=(
    "$CLAUDE_BIN"
    -p
    --output-format json
    --json-schema "$CLAUDE_SCHEMA_INLINE"
    --permission-mode bypassPermissions
    --add-dir "$PROJECT_DIR"
    --model "${CLAUDE_MODEL:-sonnet}"
  )
  if [[ -n "$CLAUDE_BUDGET" ]]; then
    args+=(--max-budget-usd "$CLAUDE_BUDGET")
  fi

  "${args[@]}" < "$prompt_file" > "$output_file"
  pretty_json_to_md "Round $round - Claude" "$output_file" "$TRANSCRIPT_FILE"
}

run_codex() {
  local round="$1"
  local prev_claude_json="$2"
  local prompt_file="$RUN_DIR/round-${round}-codex-prompt.md"
  local output_file="$RUN_DIR/round-${round}-codex.json"
  local raw_file="$RUN_DIR/round-${round}-codex.raw.log"

  cat > "$prompt_file" <<EOF
You are Codex collaborating with Claude on the same local repository.

Repository:
$PROJECT_DIR

Your role:
- Primary executor.
- Make real progress in the repo when appropriate.
- Prefer durable root-cause fixes over local hacks.
- Verify what you change.
- If Claude's advice is wrong, say so and explain why.

Mission:
$GOAL_TEXT

Return only the structured response requested by the schema after doing the work.
EOF

  if [[ -f "$prev_claude_json" ]]; then
    {
      printf '\nLatest Claude note:\n\n```json\n'
      cat "$prev_claude_json"
      printf '\n```\n'
    } >> "$prompt_file"
  fi

  info "Round $round: Codex execution"
  local args=(
    "$CODEX_BIN"
    exec
    -C "$PROJECT_DIR"
    -s "$CODEX_SANDBOX"
    -a on-request
    --skip-git-repo-check
    --output-schema "$SCHEMA_FILE"
    -o "$output_file"
  )
  if [[ -n "$CODEX_MODEL" ]]; then
    args+=(-m "$CODEX_MODEL")
  fi
  if (( CODEX_SEARCH == 1 )); then
    args+=(--search)
  fi

  "${args[@]}" < "$prompt_file" > "$raw_file"
  [[ -f "$output_file" ]] || die "Codex did not write its final message to $output_file"
  pretty_json_to_md "Round $round - Codex" "$output_file" "$TRANSCRIPT_FILE"
}

LAST_CLAUDE_JSON=""
LAST_CODEX_JSON=""

for round_num in $(seq 1 "$ROUNDS"); do
  round_id="$(printf '%02d' "$round_num")"

  run_claude "$round_id" "$LAST_CODEX_JSON"
  LAST_CLAUDE_JSON="$RUN_DIR/round-${round_id}-claude.json"

  claude_status="$(json_field "$LAST_CLAUDE_JSON" status)"
  if [[ "$claude_status" == "done" || "$claude_status" == "blocked" ]]; then
    break
  fi

  run_codex "$round_id" "$LAST_CLAUDE_JSON"
  LAST_CODEX_JSON="$RUN_DIR/round-${round_id}-codex.json"

  codex_status="$(json_field "$LAST_CODEX_JSON" status)"
  if [[ "$codex_status" == "done" || "$codex_status" == "blocked" ]]; then
    break
  fi
done

{
  printf '# Final Summary\n\n'
  if [[ -f "$LAST_CLAUDE_JSON" ]]; then
    printf '## Last Claude Status\n\n'
    python3 -m json.tool "$LAST_CLAUDE_JSON"
    printf '\n\n'
  fi
  if [[ -f "$LAST_CODEX_JSON" ]]; then
    printf '## Last Codex Status\n\n'
    python3 -m json.tool "$LAST_CODEX_JSON"
    printf '\n'
  fi
} > "$FINAL_SUMMARY_FILE"

printf '\nDone.\n'
printf 'Run directory: %s\n' "$RUN_DIR"
printf 'Transcript:    %s\n' "$TRANSCRIPT_FILE"
printf 'Summary:       %s\n' "$FINAL_SUMMARY_FILE"
