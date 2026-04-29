# ADR-NNNN: Title

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Master plan §:** §X.Y
- **Panel debate:** YYYY-MM-DD-<slug>
- **Supersedes:** ADR-XXXX (if applicable)

## Context

What is the problem? What forces are at play? What constraints exist?

## Options considered

| Option | Pros | Cons |
| ------ | ---- | ---- |
| A      | ...  | ...  |
| B      | ...  | ...  |
| C      | ...  | ...  |

## Decision

We chose **Option X** because...

Panel members consulted: <names>

## Consequences

### Positive

- ...

### Negative

- ...

### Neutral

- ...

## Cost at scale

(Required for any decision that adds infra, AI, or external services. Skip for pure-process ADRs.)

| Scale                    | Storage / compute / API cost | Per-customer cost | % of revenue |
| ------------------------ | ---------------------------- | ----------------- | ------------ |
| 1 customer (pilot)       | ...                          | ...               | ...          |
| 5 customers / 5K workers | ...                          | ...               | ...          |
| 50 customers             | ...                          | ...               | ...          |
| 200 customers            | ...                          | ...               | ...          |

Cost ceiling considered: yes / no. If yes, where enforced (e.g. `@axhy/ai-tools` gateway).

Run `node scripts/project-costs.mjs --scenario <name>` to refresh numbers.

## Lineage

- **Derives from:** master plan §X.Y, panel debate YYYY-MM-DD
- **Supersedes:** ADR-XXXX (if applicable)
- **Affects packages:** @axhy/foo, @axhy/bar
- **Affects apps:** apps/backend, apps/mobile
- **Implementation tracked in:** issue #N or PR #M
