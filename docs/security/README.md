# Security

## Files

- `threat-model.md` — STRIDE analysis, attack surfaces, mitigations (Day 4 of evidence sprint)
- `data-flow.mmd` — Mermaid diagram of where data lives at every hop
- `dpdp-inventory.md` — every personal-data field, retention rule, scrub-on-delete behavior, consent text
- `privacy-boundary.mmd` — what crosses tenant boundaries vs stays in-tenant

## Owners

- Threat model: Rohit Kapoor (Senior Security & Privacy Engineer)
- DPDP inventory: Vinod Patel (DPO)
- Compliance review: Raghav Sharma (Compliance Manager)
- External pre-launch security review: deferred until customer #5

## Mandatory reviews

- Every new endpoint needs a threat-model entry
- Every new personal-data field needs a `@personal` annotation that auto-flows to DPDP inventory
- Every major version (v3.1, v3.2, ...) re-runs the threat model

## Lineage

Master plan §E (privacy/DPDP rules), §L (bug prevention).
