---
date: 2026-08-31
tier: lesson
summary: An attribution breakdown assembled from sources of differing availability needs an explicit residual term; zero-filling the unavailable ones turns "we cannot see it" into the confident claim "there was none"
tags: [analytics, data-quality, snapshots, diff-engine, frontend]
---

# An attribution breakdown over mixed-availability sources needs a residual, not a zero-fill

**Date:** 2026-08-31
**Issue:** #1459 (epic #1458 Sprint 1)
**PR:** _(record on merge)_

## What happened

The What's Changed diff engine had computed each club's `payments` delta
since Phase 1 and never emitted an event for it — the value was calculated
one line above two categories that did emit, and then discarded. Shipping
it meant decomposing the total into its five payment types, and those five
types do **not** come from one place:

- October renewals, April renewals and new members are **typed, required**
  fields on `clubs[]` — present in every snapshot, always readable.
- Late renewals and charter payments exist only in the **raw**
  `districtPerformance` rows (`Late Ren.` / `Total Chart`). Untyped, and
  therefore genuinely optional: a snapshot variant, an older export, or a
  parse failure leaves them absent.

The tempting shape is `{oct, apr, new, late, charter}` with every field a
`number` and `?? 0` on the raw reads. It typechecks, it never throws, and
it is wrong: a club whose late-renewal column was missing renders as
"3 October renewals" for a delta of 5, or worse, the breakdown asserts
there were **no** late renewals when the truth is that we could not see
them. The parts quietly stop summing to a total the reader can see right
next to them.

The fix is two-part and neither half works alone. Type the unreliable
sources as optional (`late?: number`), so "absent" survives into the
label-building code instead of being erased at read time; and give the
label an explicit **residual** term — `total − Σ(computable type deltas)`,
rendered as `N other` — so whatever the available sources cannot explain
is still shown, and the parts never claim more than the total.

Verified on live data: with the raw rows present, a real D61 club renders
`… (3 October renewals, 3 April renewals, 1 new member, 2 late renewals)`;
re-diffing the identical pair with `districtPerformance` stripped degrades
the same club to `… 2 other`. Same total, honest either way.

## The transferable principle

**When you decompose a total into named parts and the part-sources have
different availability guarantees, the breakdown needs an explicit residual
bucket, and the optional sources must be typed optional all the way to the
formatter. Zero-filling an unavailable source is not a safe default — it
converts "we cannot see this" into the confident, false claim "there was
none of this," and it does so silently, in the one place a reader is most
likely to trust the arithmetic.** The residual is also the cheapest
availability monitor you will ever get: an `N other` that starts appearing
where it never used to is a source that has gone dark, visible in the
product rather than in a log.

This is the Lesson 115 failure mode (`totals.*` distinguished counts read 0
mid-year because they were unpopulated, not because there were no
distinguished clubs) generalized from a single field to a decomposition:
the danger scales with how authoritative the rendering looks, and an
itemized breakdown in parentheses looks very authoritative.
