---
date: 2026-08-03
tier: lesson
summary: A "do we have good data?" sentinel keyed on one field can only detect that field changing — key it on every field the consumer will actually read, or it certifies the exact drift it was meant to catch
tags:
  [
    schema-drift,
    silent-failure,
    analytics,
    csv,
    aliases,
    fallback,
    collector,
    dcp,
  ]
---

# A sentinel keyed on one field cannot detect a rename of any other

**Date:** 2026-08-03
**Issue:** #1399 (DCP goals 2-3 read 0 for all of PY 2026-27)
**Related:** #486 (the alias double-count precedent), #1388 — same class, the
correct-looking wrong thing

## What happened

Toastmasters made Online Meeting Mastery completions an alternative way to
satisfy DCP goals 2 and 3, and renamed two club-performance CSV columns with
it: `Level 2s` → `Level 2s or EOM`, `Add. Level 2s` → `Add. Level 2s or EOM`.
Goal columns resolve by exact key lookup, so both goals read **0** for every
club in every district from the day PY 2026-27 data started flowing.

That part is an ordinary schema-drift bug with an ordinary fix — add the new
names as first-match-wins aliases. The interesting part is why nobody noticed.

There *was* a guard for exactly this. `hasDcpGoalColumns()` decides whether a
record carries the per-goal columns; when it says no, consumers degrade
(`DataTransformer` omits `dcpGoalsAchieved`, the analytics module falls back to
its sequential approximation). It never fired. It was keyed on goal 1:

```ts
const goalOneColumns = DCP_GOAL_DEFINITIONS[0]!.requirements[0]!.anyOf // ['Level 1s']
```

`Level 1s` was not renamed. So the sentinel answered "yes, good goal data" with
complete confidence while two of the ten goals it was vouching for were
unreadable. The pipeline published `[true, false, true, …]` — a *wrong* answer,
not a missing one — and wrong answers do not trip alarms. 14 real awards across
13 District 61 clubs were reported as zero, with no error, no warning, and no
degraded-mode signal anywhere.

## Why the single-field sentinel is so attractive and so useless

It reads as sound sampling: the headers are uniform across the export, so one
column tells you whether the export has goal columns *at all*. That inference is
valid only for the failure mode where the whole export changes shape (legacy
data, an empty file) — and worthless for the far more common one, where a vendor
renames some fields and leaves the rest alone. A sentinel can only detect drift
in the field it samples. Sampling one field to certify thirteen means twelve of
them can drift while the check keeps saying yes.

Note the asymmetry that makes this bite: the sentinel's chosen field is the one
*least* likely to change (it's the one that has been stable longest, which is
usually why it got chosen), so it is structurally biased toward false
confidence.

## The rule

**Key a data-quality sentinel on every field the consumer will read, not on a
representative one.** If the check exists to decide "can I trust these
computed values", it must cover every input to those values. Here that means
every goal must resolve a known header, at requirement granularity (columns
inside one requirement are alternatives — goal 10 legitimately passes on
October dues alone).

Two things make the strict version safe rather than merely stricter:

1. **Pin it against captured real data before widening it.** Both captured D61
   exports (2026-06-09 old header, 2026-08-01 new header) carry every goal
   column populated for every club, so the widened check changes nothing in
   production — it only rejects partial records, which is precisely the legacy
   case the fallback was written for. Widening a guard without that evidence
   swaps a silent wrong answer for a silent blackout.
2. **Make the degradation loud.** Falling back is correct but must not be its
   own silent failure. `missingDcpGoalHeaders()` names the unresolved goals and
   `DataTransformer` logs them once per export, so the next rename announces
   itself instead of waiting for someone to notice a suspicious zero.

## Corollary on aliases

When you add the renamed header, add it as a **leading alias**, never as a
second column to sum. Historical snapshots carry the old name and new ones the
new name, but a transitional export can carry both — and summing them
double-counts exactly the clubs you were trying to fix (#486 M1). First match
wins is the whole contract.
