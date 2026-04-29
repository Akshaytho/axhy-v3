# Architecture Decision Records (ADRs)

Each ADR captures one locked decision: context, options considered, choice, consequences, and lineage anchor in the master plan.

## Format

```
docs/decisions/NNNN-<slug>.md
```

## Index

| ADR | Title | Status | Master plan §  |
|---|---|---|---|
| 0001 | Tech stack | Accepted | §E, §G |
| 0002 | Three knowledge graphs (structural + semantic + provenance) | Accepted | §M (memory) |
| 0003 | Single source of truth for schema (`@axhy/shared-schema`) | Accepted | §F |
| 0004 | Backend: Fastify + Prisma + Postgres on Railway | Accepted | §G |
| 0005 | Marketing + admin in one Next.js app | Accepted | §G, §K |
| 0006 | XState v5 for state machines | Accepted | §G |
| 0007 | Phone+OTP auth via MSG91 + jose JWT | Accepted | §G.1 |
| 0008 | Pure-function business rules (no service classes) | Accepted | §B, §G |
| 0009 | Postgres outbox over Redis/BullMQ | Accepted | §G |
| 0010 | AI at user-input boundary only (thin-AI rule) | Accepted | §E |
| 0011 | Auto-generated typed API clients | Accepted | §G |
| 0012 | Hybrid STT — Sarvam (monolingual) + Whisper (code-switched) | Accepted | §G |
| 0013 | Cloudflare R2 for file storage | Accepted | §G |
| 0014 | Token-driven design system | Accepted | §E |
| 0015 | shadcn/ui (own-the-code) over Material UI | Accepted | §E |
| 0016 | RN Reusables for mobile UI | Accepted | §E |
| 0017 | Centralized copy catalog | Accepted | §E |
| 0018 | Centralized error catalog | Accepted | §E |
| 0019 | Custom ESLint rules to prevent V2 bug treadmill | Accepted | §L |
| 0020 | Repo structure: 3 apps + 12 packages, lockstep versioning | Accepted | §K |
| 0021 | Single mobile app with role-based UI (supersedes two-app) | Accepted | §G |
| 0022 | pgvector on existing Railway Postgres for semantic graph | Accepted | §M |

## Adding a new ADR

1. Use the next available number.
2. Copy `_template.md`.
3. Fill in: Context, Options, Decision, Consequences, Lineage.
4. Update this README index.
5. Reference the ADR from any code that derives from it (`@derives(ADR-NNNN)`).
