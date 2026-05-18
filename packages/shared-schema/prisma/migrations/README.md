# Migrations — date-prefix convention + Sprint 1 date-offset note

Migration directories follow the `YYYYMMDD_NNN_<snake_case>` convention
where `YYYYMMDD` is the sequencing date and `NNN` is a zero-padded
sequence number scoped to that day. Prisma applies them in lexicographic
order, so the date prefix is the primary sort key.

## Sprint 1 date offset (2026-05-18 onwards)

Migrations `20260521_009_complaint_threading`, `20260522_010_replacement_invite`,
and `20260523_011_replacement_invite_drop_group` were all **authored and
applied on 2026-05-18** (Sprint 1 backend trilogy), but their directory
prefixes are 21 / 22 / 23 May.

**Why the offset:** Sprint 1 ran three parallel subagent builds. The
sub-agents picked sequential dates starting from "next available day
after the prior migration" (`20260520_f007_*` was the last existing
migration), without first synchronising the actual calendar date with
each other. By the time the integration pass identified the
inconsistency (deep-review Cluster C, 2026-05-18), the migrations were
already applied to the Railway sandbox and renaming them would have
caused a Prisma history-drift error.

**What this means for future readers:**

- `git log` on these migration directories shows the real authoring
  date (2026-05-18 across the board); the directory prefix is purely
  a sequence indicator, not historical fact.
- Migrations 009 / 010 / 011 together produce the final shipped shape;
  reading any one in isolation will mislead. Specifically:
  - 010 introduces a `groupId` column + partial unique index that
    were part of an abandoned multi-worker broadcast design.
  - 011 drops them.
  - The canonical post-011 shape is single-recipient
    (`feedback_replacement_invite_single_recipient.md`).

**Discipline going forward:**

- Every new migration's directory prefix MUST be today's calendar
  date (UTC) — `date -u +%Y%m%d`.
- Parallel subagents authoring migrations on the same day MUST
  coordinate sequence numbers via the integration step before
  applying. A simple `ls prisma/migrations | tail -3` before
  generating the migration filename is enough.
- If a CI date-guard ever lands, exempt these three rows (009 / 010 / 011) by name; future migrations should not need the exemption.

## Active migration sequence (lexicographic apply order)

This README is kept short; the source of truth is the directory listing
itself. Use `pnpm exec prisma migrate status` to see the current applied
state on any environment.
