---
date: 2026-08-02
tier: lesson
summary: A metric-matched fallback @font-face with no unicode-range captures every codepoint the web font does not ship, silently restyling glyphs it was never meant to touch
tags: [css, fonts, performance, frontend, visual-regression]
---

# An unscoped fallback face restyles every glyph the web font does not ship

**Date:** 2026-08-02
**Issue:** #1373 · **PR:** #1381

## What happened

Adding metric-matched `@font-face` fallbacks (`src: local('Arial')` plus
`size-adjust` / ascent / descent overrides) to kill a `display=swap` reflow. The
CLS work was clean and the type scale was untouched, so I expected the fully
loaded page to be pixel-identical to `main`.

It was not. 64 pixels differed at 375px, in one 8px band:

```
See Awards    →        (main: system-ui arrow)
See Awards    →        (branch: Arial arrow, 6% narrower, longer, thinner)
```

## Why

The font stack was `'Source Sans 3', 'Source Sans 3 Fallback', system-ui, …`.
Google serves Source Sans 3 in subsets whose `unicode-range` covers latin,
latin-ext, vietnamese, cyrillic and greek — and **U+2192 (→) is in none of
them**. Before the change, `→` fell straight through to `system-ui` and rendered
identically whether or not the web font had loaded.

My fallback face declared no `unicode-range`, which means *every codepoint*. So
it inserted itself between the web font and `system-ui` for exactly the glyphs
the web font never had — and rendered them in Arial at 93.97% scale.

Those glyphs never needed metric-matching. They were not part of the reflow;
they cannot be, because they never swap. The face restyled them for nothing.

## The lesson

**A fallback face's coverage must equal the coverage of the font it stands in
for.** `@font-face` with no `unicode-range` is a claim to serve the entire
codespace, and in a fallback chain that claim is load-bearing — it changes what
renders the characters the primary font declines.

The general shape: when you insert a layer into an existing resolution chain
(font stack, module resolver, middleware, `PATH`), scope it to exactly the
inputs it is meant to handle. A layer that answers everything intercepts cases
you never considered, and the failures are cosmetic and easy to miss.

## How to apply

Take the `unicode-range` descriptors from the provider's own CSS and merge them:

```bash
curl -s -A "<a modern Chrome UA>" \
  "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;700&display=swap" \
  | grep -o "unicode-range: [^;]*" | sort -u
```

Then assert the boundary in a test, not just the presence of the descriptor —
pick a codepoint that must be **in** and one that must be **out**. U+2191/U+2193
are inside Google's latin subset while U+2192 is not, which makes them a good
tripwire pair for an over-broad range.

## Related

- `frontend/src/styles/tokens/font-fallbacks.css` — the scoped faces.
- `frontend/src/styles/__tests__/font-fallbacks.test.ts` — the in/out assertion.
- [[phase-gated-deferral-tests-move-with-the-spec]] — Lesson 81, the previous
  attempt at making the brand fonts cheap, and why metric-matching was the
  named unblock.
