# Dispatch waves — 2026-08-31

All 22 open issues grouped into dispatchable waves. The autonomous runner is
retired (#1467), so every wave below is dispatched **manually to Opus agents**.

Grouping rules used: (1) never split a cause from its guard, (2) keep each wave
inside one subsystem so parallel agents don't collide on the same files, (3) put
anything with an external deadline ahead of anything without one.

---

## Wave 0 — Merge queue (no agent needed; you, ~15 min)

Not dispatchable work — it clears the board so later waves branch off a current
main.

| Item                                                | Action                | Note                                                                                                                                                                              |
| --------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR **#1472**                                        | merge                 | `CLEAN`. Fixes #1469 — the truncated club-index. Delivers the moved-club fix that is currently inert in production.                                                               |
| PR **#1471**                                        | merge **after** #1472 | release 2.35.1. release-please regenerates it on every merge to main, so merging #1472 first means one release, not two.                                                          |
| PRs #1414, #1415, #1420, #1421, #1439, #1454, #1455 | batch triage          | 7 Dependabot PRs. Group-merge the patch/minor ones; #1439 (hono 4.12→4.13) is the only minor-version bump worth a look.                                                           |
| Issue **#1425**                                     | **close**             | Verified stale: Data Pipeline succeeded 2026-08-29/30/31 and `v1/latest.json` carries snapshot 2026-08-30 generated 2026-08-31. The alert fired 2026-08-17 and was never cleared. |
| Issue **#1411**                                     | **close as moot**     | Worktrees existed for the retired runner. `grep` finds zero worktree references left in `scripts/` or `.github/workflows/`. Nothing consumes it.                                  |

---

## Wave 1 — Stop the daily noise (1 agent, small)

**#1419 — closing-date registry stale (2026-07)**

Live and re-firing: updated 2026-08-31T09:06, 19 comments. A monitor that cries
wolf daily trains everyone to ignore monitors — the exact failure #1266 fixed for
this same alert family once already. Worth one agent before it becomes wallpaper.

Dispatch alone. Small, self-contained, touches `scripts/closing-registry-check.ts`
and `scripts/lib/registryFreshness.ts`.

---

## Wave 2 — Data integrity for the global rollup (1 agent, sequential)

Dispatch as **one** agent working three issues in order — they share a subsystem
and a mental model, and splitting them across agents invites contradictory fixes.

1. **#1465** — the 2026-06-30 snapshot dir holds 30 PY 2026-27 districts. _The cause._
2. **#1466** — the rollup must key on distinct canonical club id. _The guard._
   Comes with a free fixture: expected **548,483**, naive sum **575,954**, and
   548,483 is exactly TI's published 2025-26 figure.
3. **#1464** — report `sourceCsvDate` / `calculatedAt` / `collectedAt` in the
   CEO-oracle census step. Small, same area, prevents the next bespoke investigation.

**Do #1466 even if #1465 slips.** The read-side guard has to hold whether or not
the archive is ever rewritten.

**Blocks:** #1426's actual build. Nothing else.

---

## Wave 3 — Club Growth Achievement (2 agents, deadline-shaped)

Epic **#1473**. Operator rulings settled 2026-08-31: PY 2026-27, cumulative from
July 1 (March includes September), tiers not separate awards, forward-only.

**The deadline is soft but real.** September 30 is ~30 days out. There is _no
data-loss risk_ — the pipeline captures charters daily and the verdict stays
computable forever. The only thing that expires is the **pending race view**
("you're at 2, one more by Sep 30"), which is worthless on October 1. Five
districts (41, 94, 114, 127, 226) are already at 3.

| Order | Issue                                                             | Agent               |
| ----- | ----------------------------------------------------------------- | ------------------- |
| 1     | **#1474** predicate + #1400 rule-change-log entry                 | A                   |
| 1     | **#1475** `newCharteredClubs` wiring + checkpoint resolution hook | B (parallel with A) |
| 2     | **#1476** District Overview card                                  | either, after both  |

**Non-negotiable constraint for whoever takes #1475:** the Sep 30 / Mar 31 verdict
must be read from _that date's own_ `all-districts-rankings.json`, never
recomputed from current rankings. A district's charter count legitimately
decreases mid-year (9 times in PY 2025-26) because clubs move districts and the
count follows them — the global sum is strictly monotonic (81 → 638), so nothing
is lost, it just moves. `fetchCdnRankingsForDate`'s silent latest-date fallback
must be unreachable here: a missing checkpoint surfaces as "not available", never
as today's numbers wearing a September 30 label.

**Minimum slice if time is short:** #1474 + #1475 + a pending-only #1476.
Settled-checkpoint history can land in October at zero cost.

---

## Wave 4 — What's Changed (2 agents, partly parallel)

Epic **#1458**. Data availability proven live: every payment type is already in
current snapshots (no collector change), and `cspSubmitted` has been in the schema
since PY 2025-26.

| Order | Issue                                       | Note                                                                                                |
| ----- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1     | **#1459** per-club payment events with type | Engine + schema + display. Establishes the `payments` event category the rest assume. **Do first.** |
| 2     | **#1460** CSP submission events             | Same shape; follows #1459's category pattern.                                                       |
| —     | **#1461** CSV export button                 | Frontend-only, independent. Parallel agent.                                                         |
| —     | **#1462** time-window preset chips          | Frontend-only, independent. Parallel agent.                                                         |
| —     | **#1463** signed net-delta in headings      | Frontend-only, independent. Parallel agent.                                                         |

The engine now computes per-club payments deltas at `diffSnapshots.ts:316` and
throws them away — 96 of D61's 161 clubs had payment deltas last month, all
invisible. That's the single highest-value item in this wave.

**Collision warning:** #1461 touches `frontend/src/utils/csvExport.ts`, which
#1459 also extends. Sequence them or accept a merge conflict.

---

## Wave 5 — Follow-ups and infra debt (1 agent, low urgency)

| Issue                                               | Note                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1470** realignment notice's 20% threshold        | Only 21 of 94 affected districts clear it; district 03's six clubs from dissolved district 05 still read as "Clubs that joined" — the exact framing #1443 set out to fix. Recommended approach: key off the reformation boundary (#1442 already knows it) rather than a size ratio. |
| **#1412** migrate pipeline off `gsutil`             | Now has a correctness justification, not just the March 2027 deprecation: `gsutil cp -I` silently truncates its stdin source list. #1472 migrates the two broken call sites; the rest remain.                                                                                       |
| **#1216** require status checks on main via ruleset | Pure CI hygiene. Would have made the 29-day-old unmerged release PR more visible.                                                                                                                                                                                                   |

---

## Parked — do not dispatch

| Issue                           | Why                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1426** CEO Report evaluation | `needs-product-review`. It is the parent goal, not a unit of work; Wave 2 is its prerequisite. Revisit after #1466.                                                                                                                                                                     |
| **#1429** CEO oracle sprint     | The 11 mismatches are documented, unexplained, and gate nothing (the workflow is dispatch-only and is not a required check). The capture-date hypothesis was refuted 2026-08-31. Leave red and honest. **Do not pin the deltas** — that is assertion pinning against an unproven cause. |

---

## Suggested concurrency

Waves 2, 3 and 4 touch different subsystems and can run at once — pipeline/analytics,
recognition, changes-feed. Waves 3 and 4 both touch the frontend but not the same
files. Wave 1 is independent of everything.

A sane maximum is **4 concurrent agents**: Wave 1 (1), Wave 2 (1), Wave 3 (2).
Start Wave 4 as Wave 3 finishes to keep frontend conflicts down.

Wave 0 should land before any of them so agents branch off a current main.
