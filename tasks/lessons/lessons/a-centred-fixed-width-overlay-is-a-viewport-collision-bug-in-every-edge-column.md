---
date: 2026-08-03
tier: lesson
summary: A fixed-width overlay centred on its trigger is off-screen wherever the trigger sits near a viewport edge — it is a property of the shared component, never of the card that reported it, and the measured correction cannot live in a Tailwind v4 translate utility
tags:
  [
    frontend,
    css,
    tailwind,
    layout,
    tooltip,
    overlay,
    shared-component,
    measurement,
  ]
---

# A centred fixed-width overlay is a viewport-collision bug in every edge column

**Date:** 2026-08-03
**Issue:** #1405 (Education Levels tooltips clip at the left viewport edge)
**Related:** #1387 (the browser-probe pattern), R10

## What happened

The report named one card and one edge: the Education Levels rows opened their
tooltip half off-screen on the left. The cause was one line in a shared
component — a `w-80` panel positioned `left-1/2 -translate-x-1/2` — so the real
blast radius was "every trigger that lands near either edge", which a probe
found immediately:

| where                              | before               | viewport |
| ---------------------------------- | -------------------- | -------- |
| Education Levels, four rows        | left −67/−65/−65/−21 | all      |
| landing table-header `InfoTooltip` | right 432 / 825      | 375/768  |
| landing table-header `InfoTooltip` | right 1407           | 1350     |
| district KPI strip `Tooltip`s      | right 399…515        | 375      |

Two different shared components (`Tooltip` at w-80, `InfoTooltip` at w-56),
both edges, every width. Fixing the reported card would have left most of it.

## The lesson

**A centred overlay of fixed width has no correct position; it has a position
that happens to work in the middle of the screen.** The trigger's column, not
the card, decides whether it clips — so the moment you see `left-1/2
-translate-x-1/2` on a fixed-width panel, the bug exists everywhere that
component is used, and the grep for other instances is not optional (R10).
Widening the viewport does not remove it: a right-edge trigger clips at 1350px
exactly as a left-edge one clips at 375px.

## The Tailwind v4 trap in the fix

The correction is measured (`getBoundingClientRect` against
`documentElement.clientWidth`), so it has to reach CSS at runtime. The obvious
move — an inline `transform` — silently does nothing: **Tailwind v4's
`translate-*` utilities compile to the `translate` _property_, not to
`transform`**, so the utility keeps winning and the panel never moves. And the
shift must _compose_ with the −50% centring, not replace it.

What works is to stop letting a utility own that declaration: move `left` +
`translate` into a real component class, and have JS publish only two numbers
as custom properties.

```css
.tooltip-panel--centered {
  left: 50%;
  translate: calc(-50% + var(--tooltip-shift)) 0;
}
```

The hook sets `--tooltip-shift` and nothing else. That keeps the placement
rule in CSS where cross-cutting layout belongs, and makes the arithmetic a
pure function that is testable without a layout engine.

Two details worth keeping:

- **Measure the panel with its own shift already applied**, then subtract it to
  recover the unshifted extent. Otherwise a re-measure (resize, re-open)
  compounds the correction instead of replacing it.
- **Clamp against `document.documentElement.clientWidth`, not
  `window.innerWidth`** — `innerWidth` includes a classic scrollbar, so a
  right-clamped panel slides underneath it.

## How to test it

jsdom has no layout, so the component test installs one: a
`getBoundingClientRect` stub that reports `unshiftedLeft + <the shift the
component applied>`. The assertion is then the real one — the box is inside the
viewport — rather than a className contract, and it fails on `main` at exactly
the measured production offsets. The pixels are proven separately in Playwright
at 375/768/1350 in both themes and both engines.

And pin the 44px trigger floor in the same guard. Shrinking the control is the
tempting way to make a 320px panel stop colliding, and it trades a readability
bug for a WCAG 2.5.5 violation. This is the fourth surprise from that floor;
the earlier three were under-reserves and a two-baseline row (#1359, #1387).
