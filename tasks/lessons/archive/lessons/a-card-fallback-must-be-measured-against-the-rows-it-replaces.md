---
date: 2026-09-14
tier: lesson
summary: A table-to-card mobile fallback is not automatically an improvement — measure the card against the rows it replaces, because a density win at 1280px can be a regression at 375px
tags: [css, responsive, tables, density, action-list, verification, a11y]
---

# A card fallback must be measured against the rows it replaces

**Date:** 2026-09-14
**Issue:** #1577 (PR #1578) · **Related:** #1562 (RaceTable's card rows)

## What happened

The action list's 65px rows became a 27px table — a 3.5× density win at
1280px, arithmetic I could do on paper: `14px × 1.35 + 2 × 4px ≈ 27px`.

Below 640px the rows fall back to card rows, reusing the pattern RaceTable
established in #1562: hidden `thead`, each `<td>` printing its `data-label`
above its value. Same mechanism, so it should have been free.

Measured in a browser, the card came out **133px** against the **105px**
list rows it replaced. The change that shortened the page 3.5× on a laptop
made it **27% longer on a phone** — on the one surface where scroll actually
costs the reader something.

The cause is that RaceTable's cells are rank-shaped: `1`, `D61`, `+4`. A
stacked label costs one short line above one short line. These cells carry
`30 September 2026` and `Intervention Required`, which wrap two or three
times in a narrow column, so the label's line is pure overhead on top of an
already-tall cell. Moving the label **inline** before its value — same
`data-label` mechanism, one `display` value different — brought the card to
104px, and the cells still line up in columns across cards, which is the
scanability the whole change was for.

## The transferable takeaway

**A responsive fallback inherits the pattern, not the outcome.** When you
adopt a layout that worked elsewhere, the thing that made it work was the
shape of ITS content. Measure the new layout against the one it replaces, at
the width where it applies, before calling the change an improvement — and
make the "before" number part of the evidence, not a memory.

The general form: a change justified by one measurement (desktop row height)
has a second surface it silently moves (phone card height). Name that surface
and measure it too, or the win is only half real.

## Two smaller things from the same afternoon

- **A phantom `scrollWidth`.** A `<table>` whose `<td>`s are `display: block`
  reports ~44px of scroll width that no element occupies. With
  `overflow-x: auto` on the wrapper that renders a scrollbar over nothing.
  Card rows need no scroller: turning `overflow-x` off below the breakpoint
  removed the scrollbar and added **0px** to the document's own scroll width
  (measured both ways with the table present and absent).
- **`.block__el::before` loses to `.block td::before`.** A BEM element class
  is `0,1,0`; the ancestor-plus-type selector is `0,1,1`. The override to hide
  one cell's label silently did nothing, and the card rendered
  "CLUB CFB Kingston Toastmasters" until the selector took the `td` with it.
  Whenever a modifier must beat a base rule written as `.block <type>`, the
  modifier needs the type too.

## Falsifiability

Measured on the built bundle in Chrome, not inferred: production 64.0px per
row / 18 rows per 1176px; this branch 27.4px / 42 rows, verified again on the
PR preview against the real 107-club District 61 section. At 375px: 104.6px
list row (reconstructed from the deleted CSS) → 133.3px stacked-label card →
103.6px inline-label card.
