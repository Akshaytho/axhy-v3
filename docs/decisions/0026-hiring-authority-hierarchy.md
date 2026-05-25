# ADR-0026: Hiring authority hierarchy (code companion to hiring-hierarchy.md)

- **Status:** Accepted
- **Date:** 2026-05-25
- **Master plan §:** §G (data model + role authority)
- **Panel debate:** founder-direct (constitutional decision recorded in chat 2026-05-25)
- **Supersedes:** none

## Context

The hiring authority — who can create members of which role — was implicit before this slice. The wave-2-prep work exposed that the admin/HR backend needed an explicit, machine-checkable rule. The founder authored `docs/locked/hiring-hierarchy.md` in the same session to lock the rule constitutionally.

This ADR is the **code-traceable companion** to that locked doc. Each export in `apps/backend/src/middleware/role-gates.ts` cites this ADR via `@derives(ADR-0026)` per the `axhy/require-derives` ESLint rule. The ADR exists so the audit trail from code → decision is greppable; the locked doc remains the constitutional source of truth.

## Options considered

| Option                                     | Pros                                                                                                                                                                     | Cons                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Single ADR + a locked doc (this design) | Code traces to ADR via greppable `@derives(ADR-0026)`. Locked doc carries the constitutional weight. Drift between them caught by the parser test in role-gates.test.ts. | One more file.                                                                                                                                                       |
| B: Locked doc only, no ADR                 | Single source of truth.                                                                                                                                                  | `axhy/require-derives` lint blocks `@derives(docs/locked/...)` — code can't pass ESLint without an ADR or master-plan reference.                                     |
| C: ADR only, no locked doc                 | Simpler.                                                                                                                                                                 | Loses the locked-doc protection mechanism (founder-approved, challenge-response for amendments). Future sessions could amend the ADR without constitutional process. |

## Decision

Option A. The ADR is the code-trace; the locked doc is the constitution. The byte-for-byte parser test in `role-gates.test.ts` keeps the in-code `HIRING_AUTHORITY` const consistent with the locked-doc table; the ADR records the existence of the decision for `@derives` lineage.

## Authority Table (mirror of locked doc)

| Caller role | Allowed target roles | Real-world frequency                               |
| ----------- | -------------------- | -------------------------------------------------- |
| SUPER_ADMIN | OWNER                | Per-tenant bootstrap (~once per onboarded company) |
| OWNER       | HR, OWNER            | Rare — owner adds HR ~1-2x/year, co-owner rarer    |
| HR          | SUPERVISOR, WORKER   | High volume — workers daily, supervisors weekly    |
| SUPERVISOR  | (none)               | Supervisors do not onboard anyone                  |
| WORKER      | (none)               | Workers do not onboard anyone                      |

This table mirrors `docs/locked/hiring-hierarchy.md`. The locked doc is the source; this ADR exists for code traceability.

## Consequences

### Positive

- `role-gates.ts` exports cite `@derives(ADR-0026)` and pass `axhy/require-derives`.
- Audit trail is greppable: `grep -rn "ADR-0026" apps/backend/src` lists every consumer of this decision.
- Drift detection via the parser test prevents the const and the locked doc from diverging silently.

### Negative

- Two files describe the same rule. The locked doc is canonical; the ADR is a derived artifact. Future maintenance: update the locked doc first, then run the parser test to verify the const + ADR remain consistent.

## References

- `docs/locked/hiring-hierarchy.md` — constitutional source
- `apps/backend/src/middleware/role-gates.ts` — code mirror
- `apps/backend/test/role-gates.test.ts` — drift-detection test
- `docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md` — design spec
- `docs/learnings/2026-05-19-all-company-admin-maps-to-owner.md` — role-name translation (COMPANY_ADMIN → OWNER in code)
