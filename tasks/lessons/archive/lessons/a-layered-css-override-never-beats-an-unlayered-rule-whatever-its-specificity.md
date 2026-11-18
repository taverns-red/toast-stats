---
date: 2026-10-13
tier: lesson
summary: A layered CSS override never beats an unlayered rule, whatever its specificity — check which side of `@layer` both rules sit on, and pin the computed value in a test
tags: [css, cascade-layers, tailwind, frontend, smoke-tests, mobile]
---

# A layered CSS override never beats an unlayered rule, whatever its specificity

**Date:** 2026-10-13
**Issue:** #1794 (district Club Growth funnel, PR #1948)

## What happened

Adding the Growth section to the Overview hub's section list pushed the 375 px
hub to 4013 px. The page-height smoke allows at most 4000 px. The fix was to
tighten the hub's single-line section links from 56 px to 48 px:

```css
[data-testid='district-hub-sections'] .mobile-row { min-height: 48px; }
```

That selector has higher specificity (0,2,0) than the base `.mobile-row`
(0,1,0), and its file is imported after `mobile-row-list.css`. It still did
nothing. CI measured the same 56 px rows and the same 4013 px page.

The cause was that `district-hub.css` wraps everything in `@layer brand { … }`,
while `mobile-row-list.css` is **unlayered**. In the cascade, layer order
is decided **before** specificity and source order, and unlayered normal
declarations beat every layer. So a layered rule cannot override an unlayered
one, however specific it is or however late it loads. Moving the override
outside the `@layer` block fixed it at once: the rows measured 48 px and the
hub had about 80 px of headroom.

## Why it slipped through

- The new smoke assertion only checked that rows were **at least** 44 px, which
  a 56 px row passes. Nothing pinned the row height the fix was meant to
  produce.
- Locally (macOS fonts) the hub was 3972 px even without the fix, so the
  page-height check passed on my machine and failed only on CI's Linux runner.
  It looked like the fix worked.

## Takeaway

1. Before writing an override, check which side of a `@layer` boundary
   **both** rules sit on. In this repo, Tailwind and several component sheets
   are layered (`index.css` declares the order), while others, such as
   `mobile-row-list.css`, are not. When the base rule is unlayered, the
   override must be unlayered too, or the base must move into the layer.
2. Assert the **computed value the fix produces** (here, row height ≤ 48 px),
   not just a lower bound that the broken state also meets. Then a dead
   override fails locally, not only where the budget is tight.
3. A page-height or size budget measured on a different OS is not proof.
   Font metrics differ, so pin the mechanism, not just the total.
