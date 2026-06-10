---
id: '156'
category: lesson
tags: [analytics, dcp, refactor, monorepo, verification]
auto_load: true
date: 2026-06-10
issues: [1118, 1095]
---

# Lesson 156 — An audit's defect list for a forked implementation is a lower bound; consolidation must re-derive the full semantic diff

**Date:** 2026-06-10
**Issue:** #1118 (epic #1095 Sprint 1)
**PR:** #1136

## What happened

The 2026-06-09 deep-dive audit verified two defects in
`DistinguishedClubAnalyticsModule`'s forked DCP goal logic: the legacy
Goals-5/6 CSV header (C1) and the Goal-10 AND-instead-of-OR rule (C2). The
sprint's job was to consolidate the fork onto a shared goal-definition
source mirroring the verified-correct `DataTransformer`.

Reading the two implementations side by side surfaced a **third, unflagged
drift**: the fork counted goals 1–8 as achieved at `> 0`, while the official
thresholds are 4/2/2/2/1/1/4/4. Goals 5/6 happen to have threshold 1, so the
audit's "5/6 report 0" evidence never exposed it — but "most commonly
achieved goal" counts for goals 1,2,3,4,7,8 were silently inflated on every
live analytics surface. The migration fixed it for free _because the shared
module encodes the canonical semantics in full_, not because anyone was
looking for it.

## The transferable principle

**An audit verifies the defects it has live evidence for; it does not prove
the rest of the fork is clean. When a sprint consolidates a forked
implementation onto a canonical source, the unit of work is the full
semantic diff between fork and canon — every threshold, alias, gate, and
mode — not a patch per reported defect.** Patching C1 and C2 in place would
have left the threshold drift alive and "fixed" the issue. The shared-source
migration is what actually closed the family. Corollary (extends
[[061]] "audit every implementation of a formula"): when the fix-shape is
"migrate onto canon," diff the _whole_ fork against canon first and write
the red tests from the canon's semantics, not from the audit's defect list.

## How to apply

- Before migrating a fork onto a shared source, produce the side-by-side
  semantic table (column names, thresholds, combination logic, presence
  gates) and treat every divergence as a candidate defect — flagged or not.
- Write the red tests from the canonical semantics (here: the official DCP
  thresholds verified against TI's own Goals Met), so unflagged drift fails
  loudly instead of surviving the consolidation.
- A parity test against the canonical implementation (same fixture →
  identical output before/after) pins the migration itself; boundary tests
  at each official threshold pin the semantics.

## Related

- [[061]] — audit every implementation of a formula when fixing it; this
  lesson is the consolidation-time complement.
- `packages/analytics-core/src/analytics/dcpGoalDefinitions.ts` — the shared
  source this sprint created.
