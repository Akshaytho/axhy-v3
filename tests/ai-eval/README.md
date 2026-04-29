# AI eval suite

Fixed test fixtures + scoring harness for every AI surface in Axhy.

## Surfaces

| Surface | Fixtures | Score metric | Regression budget |
|---|---|---|---|
| `voice-parse` | 50 supervisor voice notes (en/hi/te + code-switched) | F1 vs gold structured-change extraction | ≤ 2% drop |
| `verification` | 50 worker before/after photo + voice pairs | accuracy vs gold human assessment | ≤ 2% drop |
| `onboarding` | 30 simulated owner conversations | rules-extracted-correctly rate | ≤ 5% drop |
| `alias-map` | 200 worker name + nickname pairs | match rate | ≤ 3% drop |

## Run

```bash
pnpm ai:eval
```

Runs against current code + current Anthropic/OpenAI/Sarvam models. Reports per-surface F1/accuracy. Fails CI on regression beyond budget.

## When to update fixtures

- Real customer reports a flow we got wrong → add fixture covering that case
- New language or accent observed in field → add fixtures covering it
- Major model upgrade → re-baseline ALL fixtures and update gold answers

## Lineage

Master plan §E (AI architecture). ADR-0010.
