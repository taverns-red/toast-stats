---
date: 2026-08-31
tier: lesson
summary: dark-mode.css intercepts common Tailwind utilities with !important, so a component's own `theme-dark:` colour variant loses — and only for the properties that happen to be intercepted, which is why the break looks half-applied
tags: [frontend, dark-mode, tailwind, css, accessibility, verification]
---

# `dark-mode.css` intercepts Tailwind utilities with `!important`, beating `theme-dark:` variants

**Date:** 2026-08-31
**Issue:** #1462 (epic #1458 Sprint 4 — time-window preset chips)

## What happened

The new preset chips needed a pressed state. The obvious Tailwind expression of
an inverted chip is a light-on-dark pair in light mode and its mirror in dark:

```
bg-gray-900 border-gray-900 text-white
theme-dark:bg-gray-100 theme-dark:border-gray-100 theme-dark:text-gray-900
```

Light mode was perfect. Dark mode rendered the pressed chip **dark text on a
dark fill with a light ring** — illegible. Every unit test passed, including two
jest-axe scans (axe auto-disables `color-contrast` under JSDOM).

The cause is one line in `frontend/src/styles/dark-mode.css`:

```css
[data-theme='dark'] .bg-gray-100 {
  background-color: #1e1b27 !important;
}
```

That file exists precisely to "intercept common Tailwind utility classes when
`[data-theme='dark']` is active, avoiding the need to add dark: variants to 50+
component files" — its own header says so. It does that with `!important`, which
outranks the `theme-dark:` variant no matter how specific the component is.

## Why it was slow to see

**Only the intercepted properties lose.** `dark-mode.css` overrides
`.bg-gray-*`, but nothing was intercepting `text-gray-900` or `border-gray-100`,
so those applied normally. The chip therefore flipped its ink and its border
while keeping the resting fill — a *half-applied* state that reads like a
specificity puzzle in the component rather than a global override elsewhere. A
wholly-unstyled element would have been obvious; a partly-styled one sent me
looking in the wrong file.

## The fix

Colour moves out of Tailwind gray utilities and into a component class using the
**redesign tokens**, which remap light/dark together by design (Lessons
093/094):

```css
.date-preset-chip[aria-pressed='true'] {
  background-color: var(--ink);   /* #0f1720 light → #eef2f7 dark */
  color: var(--surface);          /* #ffffff light → #111922 dark */
}
```

One declaration, correct in both themes, nothing to keep in sync — and no second
rule for a future theme to intercept.

## The rule

**Inside `[data-theme]` scope, a component may not express colour with a Tailwind
utility that `dark-mode.css` intercepts.** Before writing `theme-dark:bg-*` /
`theme-dark:text-*`, grep `dark-mode.css` for that utility; if it appears with
`!important`, reach for the redesign tokens (`--ink*`, `--surface*`, `--line`)
in a component class instead. This is R10 ("CSS-level overrides beat
component-level changes for cross-cutting concerns") pointed the other way: the
cross-cutting layer wins whether or not you wanted it to.

## How to catch it

- The unit suite cannot see this: JSDOM computes no cascade for the imported
  stylesheet, and axe disables contrast checks there. **A live dark-mode pass is
  the only detector** — this one was found by toggling the theme in a real
  browser, four commits after the chips "worked".
- Guard the fix with a test that asserts the *absence* of the trap rather than
  the presence of the fix: the chips carry `date-preset-chip` and match no
  `/\bbg-(gray|white|black)/` or `/\btext-(gray|white|black)/`. That fails the
  moment someone reintroduces a utility the theme layer can eat.

## Related

- R10 (`tasks/rules.md`) — the origin rule; its opacity-variant clause is the
  sibling trap (`text-tm-*-80` bakes rgba). This adds: plain, non-opacity
  utilities are intercepted too, with `!important`.
- [[opacity-variant-utilities-need-explicit-dark-mode-overrides]] — same layer,
  different mechanism.
- [[tailwind-dark-variant-is-os-keyed-and-misfires-under-a-manual-theme-toggle]]
  — why this app has a `theme-dark:` custom variant at all.
