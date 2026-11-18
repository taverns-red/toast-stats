---
date: 2026-08-02
tier: lesson
summary: A scanner harness that prints the first N nodes of a violation silently re-attributes the rest to the first cause — count by distinct fingerprint, not by the sample
tags: [accessibility, axe, debugging, testing, tooling, measurement]
---

# A sampled scanner report mis-attributes the nodes it truncated

**Date:** 2026-08-02
**Issue:** #1360 (landing page Lighthouse a11y 0.87)

## What happened

The issue arrived with a precise-looking finding, measured with axe-core:

> **Awards Race "won" status (17 nodes, 1350px):**
> `.awards-race-card__status--won > span` — `#c9b748` on `#ffffff`, ratio 2.02

Seventeen nodes, one cause, one fix. Except the gold status only renders once
per award card, and there are three cards. Seventeen was never possible.

The harness was the reason:

```js
sample: v.nodes.slice(0, 3).map(...)   // ← prints 3, reports n = 17
```

It printed `n` from the full list and the *first three* targets. All three
happened to be the gold. The remaining fourteen were two unrelated defects:

| nodes | element | measured |
| --- | --- | --- |
| 3 | `.awards-race-card__status--won` | #c9b748 on #ffffff — 2.02:1 |
| 10 | `.text-green-600` (growth deltas) | #16a34a on #ffffff — 3.29:1 |
| 4 | `.text-tm-loyal-blue-70` | #45748f on #e6ecf0 — 4.23:1 |

Fixing "the 17-node gold defect" would have cleared 3 of 17 and left the
acceptance criterion ("zero `color-contrast`") failing, with a plausible story
for why it was done.

## Why this shape is dangerous

A truncated sample does not read as truncated. `n: 17` and three matching
targets compose into a confident, specific, wrong claim — and the claim is
*more* convincing than the raw data would have been, because the sample is
homogeneous. Nothing in the output says "there are 14 you did not see."

It is the reporting layer that lies here, not the tool. axe returned all 17
nodes with full detail. The harness threw 14 away and kept the count.

## How to apply

- **Aggregate by fingerprint, don't sample.** For contrast, group by
  `(rule, foreground, background)` and print a count per group. The three
  families above separate instantly, and the total still reconciles to `n`.
- **Sanity-check the count against the DOM.** "17 nodes" for an element that
  renders three times is a contradiction, and contradictions are the cheapest
  bug detector available — the same tell as the opposite-signed CLS deltas in
  [[a-font-swap-reflow-masquerades-as-a-reserve-error]].
- **Re-measure before believing an inherited finding.** A handed-down number
  carries the measurement bug of whoever produced it. Re-running the scan cost
  ninety seconds and changed the scope of the work.
- Corollary of [[bisecting-a-gate-with-no-headroom-finds-variance-not-a-regression]]:
  there, a scalar hid the sum of two bugs; here, a *sampled list* did. Prefer
  the full per-node data, then aggregate it yourself.

## Related

- `frontend/src/__tests__/accessibility/LandingContrast.test.ts` — one case per
  family, so a partial fix cannot read as done
