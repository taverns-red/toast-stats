---
date: 2026-09-02
tier: lesson
summary: A scale can't buy room for labels — only flow layout can
tags: [charts, frontend, layout, testing, accessibility]
---

# A scale can't buy room for labels — only flow layout can

**Date:** 2026-09-02
**Issue:** #1517 (KPI bullet-card tier labels collide in every district)
**PR:** #1518

## What happened

Lesson 65 (#558) fixed colliding tier labels on the same component by
zooming the scale into the tier band, and predicted the remaining edge
case away:

> **current far below the band** → `minScale = current` → marker pins to
> the left edge; tiers spread across the rest of the bar.

The second clause is false, and it is the common case. When `current` is
far below Distinguished the scale must stretch down to reach it, so the
tier band — which was already narrow — becomes a *smaller* fraction of a
*longer* scale. On D61 Membership Payments (current 2,274 against
D 5,945 … Sm 6,357) the four tiers land at 83.42 / 86.10 / 88.78 /
92.78%: a 9.36% span. On the 375px 2-column card grid the cards are
113px wide, so that is ~12px of bar for four ~30px labels. Fifteen
months later the same component was illegible again, from the same
screenshot symptom (`DSPSm`, values printed over each other).

## How to apply

**A scale decides where a mark goes. It cannot decide how wide the text
beside that mark is. If two labels can be arbitrarily close, no choice
of scale fixes them — take the text off the scale and put it in normal
flow.**

Concretely: the marks stay absolutely positioned (they carry the
positional meaning and a 1px rule needs 1px). The text moves to a
`flex flex-wrap` list below, where the browser's own layout guarantees
separation. There is then no width budget to tune, no scale to re-zoom,
and the result holds for every district and viewport without depending
on the data. Lesson 65's zoom is still right and stays untouched — it
answers "where am I in the tier range?" It was only ever answering the
wrong question about *labels*.

Telltale: you are reaching for staggered rows, alternating offsets, or
"show the value only for the next tier". Those all trade legibility for
information; flow layout trades neither.

## Two traps this surfaced

**A JSDOM test cannot see this bug — and "abutting" is a separate
failure from "overlapping".** The markup looked correct on `main`; only
the pixels were wrong, so every class-name or DOM-order assertion passed
on the broken code. The honest guard reads `getBoundingClientRect()` in
a real engine (Playwright, both configured projects). And it must
require a positive *gap*, not merely a non-negative one: `DSPSm` is four
boxes touching at exactly 0px, which an overlap-only assertion waves
through. Filter to text-bearing elements first — a bare 1px tick may
legitimately sit 3px from its neighbour.

**Making a tooltip keyboard-reachable by adding `tabIndex={0}` silently
mints sub-44px tap targets.** `INTERACTIVE_SELECTORS` (and the 44px
floor in `styles/layers/base.css`) include
`[tabindex]:not([tabindex="-1"])`, so four focusable readouts per card
would have reddened `e2e/touch-targets.smoke.ts` on `/district/61`. The
better answer was to stop gating the information on interaction at all:
print the value in the flow and the full tier name in an `sr-only` span,
reachable by every input method at once. The tooltip it replaced hung
off a 1px box with no focusable child — hover-only in practice, so
nothing was lost.

## Related

- `frontend/src/components/KpiBulletCard.tsx` — ticks as marks, thresholds in flow
- `frontend/e2e/kpi-tier-labels.smoke.ts` — the geometric guard
- Lesson 65 (#558) — the zoom scale, whose "tiers spread across the rest
  of the bar" prediction this corrects
- `jsdom-style-assertions-do-not-catch-positioning-bugs.md` (#559) — the
  same component, the same blind spot one layer up: JSDOM confirmed the
  inline `left` was right while the browser resolved it against the wrong
  containing block. That lesson said "audit the live site"; this one says
  what to assert there, and puts it in a test
