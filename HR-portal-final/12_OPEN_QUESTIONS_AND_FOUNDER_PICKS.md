# 12 — Open Questions & Founder Picks

> Source of truth: `99_CANON_FACTS.md` §13 (F-P-1..8), plus every `[ASSUMPTION]` made across this doc set. Nothing load-bearing was invented silently; this is the full list of what your answer would change.

Three buckets: **A. Founder picks** (the eight `F-P-*` from the closure spec — the design proceeds on their defaults), **B. Assumptions this doc set made** (reasoned gap-fills you can overturn), **C. Decisions to confirm before backend build** (forks with engineering cost).

---

## A. Founder picks (F-P-1..8)

The design runs on the **bold default**. Where the pick is HR-load-bearing, the surface that depends on it is named.

|       F-P | Question                              | Options (default **bold**)                                              | Affects                                      | If you change it                                              |
| --------: | ------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| **F-P-1** | Pod-size target                       | 150w/3sup · **200w/4sup** · 250w/5sup                                   | Pod count, per-HR load, pod-home/split-merge | Re-tunes `hr.pod.target_*` Policy; pod-home math only         |
| **F-P-2** | HR queue SLA durations                | tight 1h/12h/5d · **2h/24h/7d** · loose 4h/48h/14d                      | Queue triage, escalation cron                | Changes badge thresholds + escalation timings (Policy seed)   |
| **F-P-3** | Termination appeal window             | 3d · **7d** · 14d                                                       | Worker termination + appeal                  | Changes the appeal timer; HR fields appeals either way        |
| **F-P-4** | Reverse window (R6 30min vs D.1 5min) | 5-min · 30-min · **5/30 hybrid**                                        | Retroactive correction                       | Affects HR's late-correction workflow downstream              |
| **F-P-5** | AI-overage language                   | hard-stop · overage-charge · **pause+notify-owner**                     | Owner alerts                                 | Owner-facing; **not HR**                                      |
| **F-P-6** | Site-level HR Updates routing         | **company-wide + opt-in later** · both day-1 · company-wide+manual-flag | HR Updates audience                          | If site-level on, the composer (S17) gains an audience picker |
| **F-P-7** | Worker preferred-language default     | **tenant default (`hi`)** · OTP-detected · explicit-prompt              | Worker invite                                | Changes S5's language default behavior                        |
| **F-P-8** | HR-unreachable secondary contact      | designate a contact · **confirm "situation waits"**                     | Terminal fallback tier                       | Adds (or omits) a final contact in the 72h fallback           |

**Most HR-load-bearing:** F-P-1, F-P-2, F-P-6, F-P-8. None block building the portal — they set defaults the Policy layer can change later. (`closure §12`; kickoff §6 "Layer 1 has zero founder-pick blockers")

---

## B. Assumptions this doc set made (overturnable)

Each is a reasoned gap-fill where the sources were silent. Marked `[ASSUMPTION]` at its source location.

1. **Folder location** — these docs live at `axhy-v3/HR-portal-final/`. _Assumed_ beside the sibling `superdocsfinal/` and the project docs. → Move to root or `docs/personas/hr/` on request. (`00_README §Folder location`)
2. **Sidebar navigation** (not tabs) — _assumed_ because admin-web is laptop-first and HR work is cross-cutting/reference-heavy. → If you want a different shell, `06` changes, nothing else. (`06 §1`)
3. **Queue is the front door** — _assumed_ most episodic work (coverage, termination, bootstrap) is reached _through_ the queue/person/site, not standing nav. → Reasonable but a UX call. (`06 §3`)
4. **QueueItem = projection first, table later** — the closure spec describes a projection; _assumed_ we start by projecting from existing rows and add a `QueueItem` table only if performance demands. → A real engineering fork (see C). (`08 §3`, `10 §B`)
5. **Endpoint shapes in `10 §B`** — proposed where the closure spec didn't pin them (coverage verbs, queue, terminations, payroll-close). _Assumed_ names/bodies; confirm at backend build. (`10 §B`)
6. **api-client: generate it** — _recommended_ over hand-written wrappers given ~20 new endpoints and the drift bugs history. → Cost/benefit call (see C). (`11 §6`)
7. **HR rules editor (S18) is in-scope** — the closure spec implies HR Layer-2 policy authoring; _assumed_ it earns a screen now (thin). → Could defer to a later wave. (`05 E1`, `07 S18`)
8. **Payroll-close ships as prep-only now** — _assumed_ worth building the prep surface even though the engine is deferred, because it's Kavitha's named fear and the prep alone removes the Excel reconciliation. → Could defer entirely until the engine is scoped. (`05 G1`, `13`)
9. **Owner-also-allowed on HR GETs** — kept from HR-A1's gating (OWNER sees full tenant). _Assumed_ the fresh nav stays HR-shaped while allowing owner read. → Confirm owner shouldn't get a distinct view. (`06 §2`)

---

## C. Decisions to confirm before backend build (engineering cost)

These have real implementation weight and should be settled before Layer-1/2 code:

1. **QueueItem: projection vs. table.** A projection is faster to ship and avoids a write-path; a table gives durable `slaTier/escalatedAt/lockedBy` and simpler locks. The closure spec leans projection; locking + escalation may push toward a thin table. **Recommend:** start projection, add a `QueueItem` lock/SLA table only for the fields locks/escalation need. (`08 §3`)
2. **api-client generation.** (b) generate vs (a) hand-write. **Recommend (b)** to kill contract-drift bugs across four portals. (`11 §6`)
3. **Wiring the termination HR-ack lock + worker-machine driver.** Specified, not built. This is the single most important _backend_ gap behind an HR surface (S16). It must be wired before the termination ack screen is real, not after. (`09 §4`, `10 §B`)
4. **Refresh-token rotation in admin-web.** Deferred at HR-A1 (→F1-c). A real HR session is long; wire rotation as part of this build so sessions don't silently die mid-task. (`11 §2`)
5. **Bank-detail capture at onboarding vs. owner-only.** HR captures bank at worker/member create (S4/S5); bank _changes_ are owner+OTP. Confirm HR may _enter_ bank at create (the salary-on-Membership model says yes, ADR-0025) but never _edit_ it later. (`04 §6`)
6. **Same-day-freeze UX wording.** Every binding screen says "effective tomorrow." Confirm the operational escape hatch for true same-day emergencies (handled off-system today) is acceptable, or whether HR needs an audited `bypassFreezeReason` affordance. (`04 §7`, `09 §7`)
7. **How much "accounts" is in HR v1? (the biggest scope fork.)** Kavitha is HR _and accounts_. v1 as designed does **attendance + base + pro-rata** payroll prep only; **statutory deductions (PF/ESI/PT/TDS), an advances ledger, full-and-final, and bonus runs are deferred** (`05` G3–G5, `13` D9). This is a real fork: if "payroll easier" is the headline win you want first, more of the accounts half must move into v1 (and that's a meaningful build, possibly its own design session). If coordination-first is fine, the deferral stands. **Your call materially changes the build size and order.** (`02 §3 Accounts`, `14`)
8. **HR-initiated bank-change _request_?** Bank _changes_ are owner-only + 2-step OTP (correct, locked). But in real cleaning ops bank/UPI corrections are frequent (workers change numbers, bounce-backs). Confirm whether HR should get an **HR-initiated bank-change request that the owner approves in one tap** (vs. every correction being a fresh owner-side action). This keeps the owner as the authority while not routing a weekly blocker entirely off-HR's-screen. (`02 Kavitha-lens`, `04 §6`)

---

## D. Known unknowns / silences in the sources

- **No SuperAdmin oversight of HR** appears in the closure spec or audits — a genuine silence, not an omission. The SuperAdmin portal (next-next) will need its own persona pass. (HR-persona digest §SuperAdmin)
- **Payroll engine scope** is undefined beyond "Phase D stub." The prep surface is built to be engine-ready, but the engine itself needs its own design session. (`05 G1`)
- **Per-supervisor HR-Update ack** is v0 (single `acknowledgedBy` uuid). At scale, multiple supervisors acking one update needs a join table — flagged for the HR-Updates build. (`08 §1 HRUpdate`)
- **The "discard admin-web UI" decision is new this session** and not yet in the brain or a locked doc. If it should be durable, it wants a short ADR/decision record so a future session doesn't "rediscover" the old UI as canon. (`99 §0`)

---

## How to resolve

For the F-P picks: a one-line answer each updates the Policy seeds and a couple of screens. For B/C: confirm or overturn; each overturn touches the named doc(s) only, because the dependency is recorded. The design is deliberately built so your answers refine it without re-architecting it.
