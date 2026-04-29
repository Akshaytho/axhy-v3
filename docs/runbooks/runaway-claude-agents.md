# Runbook: runaway Claude / API cost investigation

Use when: you see an unexpected spike in Anthropic / Claude bill, OR you suspect a forgotten agent is bleeding tokens.

## Step 1 — Check Claude Code remote routines

Scheduled remote agents (cron-style) live at: <https://claude.ai/code/routines>

From inside any Claude Code session, ask:

> "list and disable every Claude Code routine on my account"

Claude will use the `RemoteTrigger` tool to enumerate and disable. Or, run:

```bash
node scripts/stop-all-claude-routines.mjs   # requires CLAUDE_CODE_OAUTH_TOKEN
```

To **delete** (not just disable), use the web UI — the API does not support delete.

**As of 2026-04-29: zero routines on this account.** Confirmed via `RemoteTrigger list` and committed in `0a5a7c0`+`933a7a4` history.

## Step 2 — Check for orphan Claude Code sessions on your machine

These bill API tokens when active. Forgotten VSCode/Antigravity windows are the most common cause.

```bash
# All Claude Code processes
ps aux | grep "anthropic.claude-code" | grep -v grep

# Identify each by its working directory (helps you decide which to kill)
for pid in $(ps aux | grep "anthropic.claude-code" | grep -v grep | awk '{print $2}'); do
  echo "PID $pid:"
  lsof -p $pid 2>/dev/null | grep cwd
done

# Kill all Claude Code sessions EXCEPT the one you're using right now
# (replace ACTIVE_PID with the PID of the session you want to keep)
ps aux | grep "anthropic.claude-code" | grep -v grep | grep -v ACTIVE_PID | awk '{print $2}' | xargs kill
```

## Step 3 — Check Railway services for cron schedules

```bash
# List all cron schedules across all your Railway projects
railway list --json | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const proj of data) {
    for (const env of proj.environments?.edges || []) {
      for (const svc of env.node.serviceInstances?.edges || []) {
        if (svc.node.cronSchedule) {
          console.log(proj.name + " > " + svc.node.serviceName + " > cron: " + svc.node.cronSchedule);
        }
      }
    }
  }
'
```

**As of 2026-04-29: zero cron schedules across `axhy-v3`, `sublime-contentment`, `secure-joy`.**

To disable a cron schedule on a specific service:

- Railway dashboard → project → service → Settings → Schedule → toggle off
- Or via the Railway dashboard's UI directly

## Step 4 — Anthropic Console usage check

Manual — login required. I cannot access these for you.

| Where                                     | What to look for                                                      |
| ----------------------------------------- | --------------------------------------------------------------------- |
| <https://console.anthropic.com/usage>     | Past 30 days API usage. Filter by workspace. Spikes show their hour.  |
| <https://console.anthropic.com/workbench> | Any saved Workbench experiments running long completions in a loop.   |
| <https://claude.ai/settings/usage>        | If your bill is on the Pro/Team subscription side, separate from API. |

## Step 5 — claude-mem and other local helpers (informational; not cost sources)

These run locally and do NOT bill Anthropic API:

- `claude-mem` worker daemon (PID typically alive since reboot, runs on port 37777). Stores observations in local SQLite.
- `claude-mem` MCP server. Local-only, served by stdin/stdout to Claude Code on demand.

Leave both running. They're free.

## Step 6 — Lock the cost source

Once you've identified what was bleeding tokens:

1. Add a CronList check to your weekly review.
2. Make it a habit to close VSCode windows that have agentic Claude Code sessions.
3. Set Claude Code's `MaxTokensPerSession` if Anthropic exposes that knob.
4. Set an Anthropic Console usage alert at 80% of monthly budget.

## Lineage

Runbook created 2026-04-29 in response to founder cost spike. Confirmed both Claude Code routines (zero) and Railway cron schedules (zero) at time of writing. Root cause was ultimately external to this checklist — investigate orphan sessions and Console usage history.
