# Done memo — ledger #20 slice 1: leave/swap/complaint state machines

**Date:** 2026-06-11 11:05 IST · **Slice:** ledger-20-leave-swap-complaint-state-machines

## What shipped

Three pure state-machine helper modules in `packages/state-machines/src/`, the source of truth the locked rule (`.claude/rules/state-machines.md`) requires for these entities — previously missing (transitions were inline string guards only):

- `leave-request.ts` — `REQUESTED → APPROVED | REJECTED` (both terminal)
- `swap-request.ts` — `SENT → ACCEPTED | DECLINED` (both terminal)
- `complaint.ts` — `OPEN → IN_HR | RESOLVED | DISMISSED`, `IN_HR → RESOLVED | DISMISSED`

Each exposes `canTransition(from,to)`, `assertTransition(from,to)` (throws named on illegal), `isTerminal(state)`, and a state-string type. Mirrors `assignment.ts`. Namespaced in `index.ts` (`leaveRequest.*`, `swapRequest.*`, `complaint.*`) to avoid the shared `canTransition` name.

## Verification

- `packages/state-machines` tsc 0 · `tsc -b` build OK · backend tsc 0 (consumes the package).
- 31/31 unit tests: exhaustive legal/illegal transition matrices + terminal checks + throw-naming.

## States verified against live code

`leave-requests.ts:306` (updateMany where state=REQUESTED), `swap-requests.ts:207` (where state=SENT), `complaint-service.ts:239` (NOT IN RESOLVED/DISMISSED) + `:392` (IN OPEN/IN_HR) + schema.prisma:774.

## Next gated slices (route adoption — NOT in this slice)

Wire `leave-requests.ts`, `swap-requests.ts`, `complaints.ts`, and `/chat/apply` to call `assertTransition` before their conditional `updateMany`, each with a **real-DB transition test** (the locked-rule requirement for wired paths). Definitions-only here → runtime behavior unchanged, so adoption can proceed incrementally and safely.
