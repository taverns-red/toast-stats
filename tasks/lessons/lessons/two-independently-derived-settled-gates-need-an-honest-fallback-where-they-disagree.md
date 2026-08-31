---
date: 2026-08-31
tier: lesson
summary: When a render layer fuses two independently-derived "has this happened yet" gates, give their disagreement an honest fallback instead of assuming it is unreachable
tags: [frontend, data-pipeline, verification, cls]
---

# Two independently-derived "settled" gates need an honest fallback where they disagree

**Date:** 2026-08-31
**Issue:** #1476 (epic #1473 — District Club Growth Achievement)

## What happened

The Club Growth Achievement card fuses two pieces that each decide, on their
own, whether a checkpoint has already happened:

- `resolveClubGrowthAchievement` (#1474) settles a checkpoint by **date** —
  `asOfDate >= checkpointDate`, where `asOfDate` is the pinned snapshot the
  page is displaying.
- `useClubGrowthMilestones` (#1475) settles it by **archive availability** —
  "some snapshot dated at or after the checkpoint exists", i.e. proof the
  pipeline ran past it.

In production these cannot disagree: the page's `asOfDate` IS a date from the
archive, so `asOfDate >= checkpointDate` implies a snapshot at or after the
checkpoint exists. It is tempting to treat the crossed case as impossible and
let it fall through whatever branch happens to catch it.

It surfaced anyway during verification. Forcing `asOfDate = '2026-10-31'`
against an archive that ends 2026-08-30 put the predicate in *settled* and the
hook in *pending* simultaneously — no count for a checkpoint the predicate had
already decided was over. Because the card's `unavailable` branch had a
catch-all reason string ("the charter count for this district could not be
read") rather than assuming one of the hook's three enumerated reasons was
always present, the state rendered honestly instead of falling through to a
zero or to an unreached tier.

## The transferable lesson

**Two gates derived from different sources will eventually disagree, even when
the disagreement is provably unreachable in production today — because the
proof depends on an invariant (here: "the displayed date comes from the
archive") that a future caller can break without touching either gate.** Give
the crossed quadrant a named, truthful rendering rather than letting it land in
whichever branch is last.

The corollary matters more than the rule: a fused state machine's fallback must
be **"we cannot say"**, never the neutral-looking value. `0`, "not reached",
and "not earned" are all *claims*; only "not available" is the absence of one.
A branch that can be reached by a combination you did not enumerate must
therefore default to the non-claim.

## How to apply

- Enumerate the cross product of the two gates' states, not each gate's states
  separately. Name what the crossed cells render.
- Keep the enumerated reasons **and** a catch-all in the same switch, with the
  catch-all making the weakest possible claim.
- Falsify by forcing the crossed cell in a real browser against real data —
  it took one temporary prop override to reach a quadrant no unit test had
  thought to construct.
