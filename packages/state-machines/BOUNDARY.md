# @axhy/state-machines — BOUNDARY

## Owns
- All 6 XState machines: VisitState, WorkerState, SiteState, LeaveRequestState, DeviceState, AssignmentConfigState
- State definitions, transitions, guards, actions
- Auto-generated state diagrams (Mermaid) for the structural graph

## Does NOT own
- Persistence (lives in `apps/backend`)
- AI calls (those happen at the user-input boundary, never inside a transition)
- HTTP routing
- UI

## Internal dependencies
- `@axhy/shared-schema` — for entity types

## NEVER imports
- `@axhy/ai-tools` — state machines are deterministic; AI is at the boundary
- `apps/*` — packages never depend on apps

## Who imports this
- `apps/backend` — primary consumer
- `apps/mobile` — for offline state-aware behavior
- `@axhy/business-rules` — for state-aware rules

## Lineage anchor
Master plan §G — locked state machines. ADR-0006 — XState v5 chosen.
