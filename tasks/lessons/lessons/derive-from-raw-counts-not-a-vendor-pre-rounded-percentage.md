---
date: 2026-05-25
tier: lesson
summary: Derive a count from raw integer inputs, not a vendor's pre-rounded percentage
tags: [analytics, frontend, dcp, data-pipeline]
legacy_id: "104"
---

# Lesson 104 — Derive a count from raw integer inputs, not a vendor's pre-rounded percentage

**Date:** 2026-05-25
**Issue:** #688 (epic #683 Sprint 5 — region pages)
**PR:** [#702](https://github.com/taverns-red/toast-stats/pull/702)

## What happened

The region table needed the absolute count remaining to the minimum
Distinguished tier (paid clubs / payments / distinguished clubs). The
canonical analytics fields (#686) weren't in the live snapshot yet, so the
frontend derived a fallback so the columns render today.

The first cut derived from `nextTierGap`'s clamped gap %:
`ceil(paymentGrowthGap / 100 × paymentBase)`. The algebra looked exact —
`ceil(gap%/100 × base) = ceil(base×(1+min/100) − current) = ceil(base×(1+min/100)) − current`
because `current` is an integer — so it was committed as "zero drift,
mathematically identical to the canonical field."

Fresh-context /review falsified it on real data: the count drifted **±1**
from the canonical field on ~12 live districts (D21 1031 vs 1032, D33 515
vs 516, D64 265 vs 264). The flaw was upstream of the algebra:
`paymentGrowthPercent`/`clubGrowthPercent` are **TI's published percentages,
pre-rounded to 1 decimal place**, not `(current − base)/base × 100` at full
precision. The proof assumed the latter. Re-deriving from the raw integer
`base` + `current` counts with the same `max(0, ceil(base×rate) − current)`
formula the calculator uses matched the canonical field **exactly**.

## The trap

When you reconstruct a quantity, the inputs you pick carry their own
precision. A percentage a third party publishes has already been rounded —
multiplying it back up by a base re-inflates the rounding error into a ±1
count error, and an off-by-one on a "remaining" count flips the
met/not-met (`remaining === 0`) gate. A clean-looking `ceil` identity gives
false confidence: the identity is true, but it operates on an input that was
already lossy. The same gate's _raw stock fields_ (integer counts) have no
such rounding.

## How to apply

- **Derive from the rawest, highest-precision inputs available**, not from a
  pre-formatted/pre-rounded summary of them. Integer counts > a vendor's
  1-dp percentage, even when both "describe the same gate."
- **A "proof of equivalence" must name its precision assumptions.** "current
  is an integer so `ceil(X−int)=ceil(X)−int`" is sound; the unstated premise
  "the percentage equals `(current−base)/base×100` at full precision" was the
  false one. State every input's provenance before claiming exactness.
- **Test the divergent cases, not just the anchor.** D47 happened to round to
  the same integer both ways, so a D47-only test passed under the bug. The
  fresh-context reviewer's value was computing canonical vs fallback across
  _all_ live districts and finding the ones that disagree. Pin the
  equivalence test to a known-divergent district (D21), not just the
  acceptance anchor.

## Related

- [[103-derive-a-countdown-from-the-same-gate-it-counts-down-to]] — sibling:
  103 says derive from the same gate; 104 adds _which representation of that
  gate's inputs_ — the raw counts, not its rounded percentage.
- [[060-trust-the-program-rules-on-percentage-denominators]] — same family:
  the displayed number must mean exactly what its label claims.
- [[102-a-clamped-gap-is-not-a-signed-delta]] — epic sibling; lesson 102's
  "derive the signed value from authoritative stock fields" is the same
  raw-input principle one column over.
