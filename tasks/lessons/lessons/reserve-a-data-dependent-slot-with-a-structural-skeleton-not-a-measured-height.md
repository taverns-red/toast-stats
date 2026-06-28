---
date: 2026-06-10
tier: lesson
summary: Reserve a data-dependent slot with a structural skeleton (pinned widths, inherited heights), not a measured total height
tags: [cls, css, frontend, responsive, mobile, verification, playwright]
legacy_id: "158"
---

# Lesson 158 — Reserve a data-dependent slot with a structural skeleton (pinned widths, inherited heights), not a measured total height

**Date:** 2026-06-10
**Issue:** #922 (epic #1100 Sprint 1 — mobile loading→loaded CLS, the header
actions toolbar)
**PR:** _(record on merge)_

## What happened

The landing `renderShell` didn't reserve the header-actions toolbar
(freshness pill · PY chip · date chip · Export · Share) that the loaded
state stacks above the KPI strip at <768px. The issue measured the
resulting loading→loaded shift at **140px** on the PR #921 preview, both
engines — and suggested "a height-matched placeholder", like the existing
fixed-56px `.districts-hero-search-skeleton`.

The experiment said no: reproducing the measurement locally (same staging
CDN, same fonts, same 390px viewport) gave **164px**, not 140. The toolbar's
height is emergent — three flex-wrapped 44px chips whose text widths
(a date string!), wrap points, and touch-target floors decide whether it
lays out as 2 or 3 rows. Any pinned total height is only correct for the
data + font environment it was measured in; the day the freshness date gets
longer or a chip is added, the "reserved" slot quietly under- or
over-reserves and the CLS is back (or inverted).

The shipped shape instead pins what is _stable_ and inherits what is
_emergent_:

- the skeleton reuses the **real container classes**
  (`districts-page-header__actions` + the toolbar's `flex flex-wrap gap-2`
  wrapper), so flex direction, gaps and wrap rules are the loaded ones;
- placeholders carry the **44px touch-target floor** (the same WCAG
  contract the real chips/buttons sit on) as their only height input;
- only the **item widths** are pinned (measured once per item, named
  constants with their sources) — widths exist solely to steer the wrap.

Total height is never stated anywhere; it falls out of the same rules that
size the real toolbar, across 360–767px, dark mode and font swaps.

## The transferable principle

**When reserving a slot for content whose height is emergent (flex-wrap of
data-sized items), a measured `height: Npx` placeholder encodes one
data+font environment and silently drifts; pin the stable inputs (container
classes, gaps, the per-item height floor, representative item widths) and
let the height emerge from the same CSS that sizes the real content.** And
because _some_ width is still pinned, pair it with a live bounding-box
guard (Lesson 134) that re-derives the equality on every PR — the guard,
not the constants, is the drift enforcement.

This refines Lesson 107's "reuse the real chrome + static rows": when the
real chrome _can't_ be rendered in the shell (its content is the very data
you're loading — here the freshness pill's date), reproduce its box
structure instead of approximating its total.

## Second half: end-state equality is not "no CLS" — trace the live timeline

The bounding-box guard (loading y == settled-loaded y) went green on the
preview while a PerformanceObserver `layout-shift` capture on the same URL
read **0.28–0.31**: on a real cold load the rankings query beats the
dates/index query, so the loaded toolbar first paints **without** the
freshness pill (one wrap row shorter than reserved), then rewraps ~30ms
later when the pill lands — two mirrored shifts between the two states the
guard compares. A state-pair equality check can pass across an
intermediate it never samples. The fix is the same invariant applied to
the loaded state's own pending sub-state: `DataControlsBar` reserves the
pill's slot (`freshnessPending` → an `aria-hidden` pill-width placeholder)
until the dates query settles. Cold-load CLS: 0.306 → 0.0913. So: verify a
CLS fix with a buffered `layout-shift` observer over the full load
timeline (read `entry.sources[].node` to attribute), not only with
settled-state geometry equality — and treat "query A usually beats query
B" as a sibling state that needs its own reservation.

## How to apply

- Before pinning a skeleton height, ask: does this height survive a longer
  label, another item, a font swap, 414px? If any answer is no, build the
  skeleton from the loaded state's own containers + floors.
- Re-measure the "known" shift yourself before coding to it — a number
  measured on one preview (140px) was 164px locally; if the number moves
  between environments, that's the proof a fixed height is the wrong shape.
- Keep the pinned widths as named constants with the item each mirrors, and
  state which CI guard re-verifies them (here:
  `e2e/landing-mobile-cls.smoke.ts` on the PR preview, both engines).

## Related

- [[107-a-deferred-async-insert-cls-source-reactivates-when-its-data-lands]]
  — parent: reserve-the-slot, match height by reusing real chrome; this is
  the variant for chrome whose content is the loading data itself.
- [[125-a-cls-fix-for-the-loading-state-must-cover-the-error-and-empty-states-too]]
  — the shell serves loading + both error branches, so one skeleton covers
  all three.
- [[134-a-status-chip-in-an-overflowing-table-is-still-clipped-detable-the-row]]
  — the bounding-box (not `toBeVisible`) measurement style the live guard
  uses, and the `document.fonts.ready` settling rule.
