---
date: 2026-08-01
tier: lesson
summary: A skeleton that omits an interactive element under-reserves by the touch-target floor, not by the element's visual size
tags: [cls, skeleton, accessibility, css, frontend, performance]
---

# A skeleton that omits a button under-reserves by the touch-target floor

**Date:** 2026-08-01
**PR:** #1357 (issue #1359)

## What happened

The landing page measured CLS 0.265 against a 0.1 budget. Two of the
contributing under-reserves had the same cause, and it was not the one the
skeletons were written against.

`InfoTooltip` renders a 14px info icon — `w-3.5 h-3.5`. Every skeleton that
reproduced a label carrying one reproduced the *text* and skipped the
tooltip, on the reasonable assumption that a 14px inline icon is noise.

But `styles/layers/base.css` floors **every** `button` at `min-height: 44px;
min-width: 44px` for WCAG 2.5.5. The tooltip trigger is a `<button>`. So a
14px icon occupies a 44px box, and because it is inline, it inflates the
line box it sits in:

| element | skeleton | loaded |
| --- | --- | --- |
| `.districts-kpi-card__label` (11px uppercase text) | 17px | **50px** |
| `.awards-race__header` | 43px | **88px** |

Three times the text height, from an element the skeleton's author was right
to think of as tiny. Multiplied across four KPI cards plus a section heading,
that alone was ~170px of unreserved vertical space.

## The lesson

**When reserving space for an element you are not rendering, its reserved
size is whatever the cascade gives it — not what it looks like.** A global
accessibility floor, a `min-height` on a base-layer element selector, a
flex `align-items` rule: any of these can make a component occupy far more
box than its content. Reasoning from the visual is how you get it wrong.

Two practical consequences:

- Reserve **structurally**, carrying the same rule. A `.tooltip-reserve` with
  the same `min-height: 44px` tracks the floor if the floor ever moves. A
  pinned `min-height: 50px` is a number that silently goes stale.
- The premise deserves its own test. If the loaded heading ever stops
  carrying a tooltip, the reserve becomes an over-reserve — and what should
  fail is a named test, not a mystery CLS number three sprints later.

## Where to look

Anywhere a skeleton reproduces a label: `button`, `a[href]`, `[role=button]`
and `[tabindex]:not([tabindex='-1'])` all carry the 44px floor from
`styles/layers/base.css`. An inline one inside a small-font label is the
dangerous shape, because the ratio is worst exactly where the text is
smallest.
