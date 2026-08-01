---
date: 2026-08-01
tier: lesson
summary: A CSS override must match the same element SET the utility it overrides paints — restate that set by hand and you get a silent off-by-one; derive it from the tool instead
tags: [css, dark-mode, tailwind, testing, frontend, selectors]
---

# An override must match the same element set the utility it overrides paints

**Date:** 2026-08-01
**PR:** issue #1370

## What happened

In dark mode the divider under the **first** row of every `divide-y` table
rendered bright near-white; every later divider was correctly subtle. The
dark-mode override had looked correct for months:

```css
[data-theme='dark'] .divide-gray-200 > * + * {
  border-color: var(--border-default) !important;
}
```

`> * + *` is the classic "divider" idiom — it dates from Tailwind v3, where
`divide-y` emitted `> :not([hidden]) ~ :not([hidden])` and painted
`border-top` starting at the **second** child. Tailwind v4 changed it:

```css
:where(.divide-y > :not(:last-child)) {
  border-bottom-width: 1px;
}
```

Now the utility paints `border-bottom` on `:not(:last-child)` — the **first**
child included. The override's set (`children 1..n`) and the utility's set
(`children 0..n-1`) had silently diverged by exactly one element, and only at
one end. Measured on `/district/61/divisions`: row 0 was
`rgb(229, 231, 235)`, rows 1-2 were `rgba(255, 255, 255, 0.06)`.

## The transferable part

**An override is a set operation, not a colour swap.** Its correctness
condition is `painted ⊆ overridden`, and the second set is written by hand
against a mental model of the first. When the upstream utility changes which
elements it decorates, nothing errors — the override just stops covering part
of the set. There is no type system, no build failure, no console warning; the
only symptom is a stray pixel line most people scroll past.

Two consequences:

1. **Widen rather than mirror.** `> *` beats `> *:not(:last-child)` here
   because applying a border-*colour* to an element whose border-*width* is 0
   is inert. A deliberately over-broad override survives the upstream changing
   which edge it paints and which children it skips. Mirroring the utility's
   selector re-encodes the assumption that just broke.
2. **Derive the painted set from the tool, don't restate it.** The audit for
   this compiles the real `tailwindcss` package in-process (~10ms), reads the
   selector it actually emits, and runs both selectors through jsdom's
   `querySelectorAll`. A regex over the CSS text, or a hardcoded "border-bottom
   on all but the last", would have re-asserted the very belief that was wrong.

## The test trap

The obvious test — "in dark mode a divider is dark" — **passes on the buggy
CSS**, because 2 of 3 dividers were always correct. A defect that affects one
member of a set needs an assertion over the whole set, not over a
representative. Compare sets and print the offending index; a green audit that
stays green when you re-introduce the bug is a false guarantee.

## Rule of thumb

When you write `[data-theme='dark'] .some-utility > <structural-selector>`,
you have forked a selector from a dependency. Either derive the structural
part from that dependency at test time, or make it strictly broader than
anything the dependency could plausibly emit.
