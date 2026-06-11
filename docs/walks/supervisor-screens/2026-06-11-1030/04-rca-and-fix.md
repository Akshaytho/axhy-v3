# 04 — RCA clusters and root fixes

**Clustered at:** YYYY-MM-DD HH:MM IST

## Clusters (N bugs → M roots; M must be ≪ N)

| Cluster | Bugs included (#) | Common root cause (file:line / function / assumption) | Why one root explains them all |
| ------- | ----------------- | ----------------------------------------------------- | ------------------------------ |

## Sibling check (founder rule: if one is broken, its siblings are broken)

For each root: what ELSE shares this code/data and was checked even though no bug was reported there yet?

| Root | Siblings checked | Result |
| ---- | ---------------- | ------ |

## Batch fix plan (roots only — no symptom patches, no refactors)

| Root | Minimal fix | Files touched | Fixed at (IST) | Commit |
| ---- | ----------- | ------------- | -------------- | ------ |
