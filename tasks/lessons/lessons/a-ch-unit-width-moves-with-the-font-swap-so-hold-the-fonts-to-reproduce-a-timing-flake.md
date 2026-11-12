---
date: 2026-11-12
tier: lesson
summary: A `ch` measure is font-dependent, so a font swap that races content paint rewraps text; reproduce a swap-timing CLS flake by holding the fonts past the content, in the Linux Playwright image
tags: [cls, fonts, flaky-tests, css, playwright, debugging]
---

# A `ch` measure moves with the font swap

**Date:** 2026-11-12
**Issue:** #2685

## What happened

`/district/61/council` at 1280px failed the throttled CLS smoke once and passed
on retry (0.13632, 0.12868; again on a later PR). Every failure printed the same
single shift: the export button and both club lists dropped 21px.

## Why it only failed sometimes

`.council-note` and `.council-lede` had `max-width: 70ch`. `ch` is the width of
the current font's "0": 560px in the metric-matched Arial fallback, 490px once
Source Sans 3 lands. The 70px narrowing wrapped the disclaimer onto one more
line. The shift only exists if the swap lands **after** the headline has
painted. The CI smoke serves the CDN from fixtures (unthrottled), so data and
fonts finish within ~100ms of each other and the order flips run to run.

## How it was reproduced

- Not on macOS with real CDN data: there the data arrives after the fonts.
- In `mcr.microsoft.com/playwright:<same version>-noble`, with CDN requests
  fulfilled via `route.fetch()` (node-side, outside the CDP throttle, like the
  fixtures) and every `.woff2` held until the headline exists: CLS 0.13632,
  byte-for-byte the CI geometry.
- A before/after rect dump of the page's blocks named the element
  (`P.council-note h105 w560 -> h126 w490`); the layout-shift `sources` list
  printed it as a detached node.

## The rule

- A width that must not move with the font is stated in `em` (tracks font-size
  only), not `ch`. `70ch` of Source Sans 3 is `30.625em` (70 x 0.4375).
- To reproduce a "passes on retry" CLS flake, force the losing order instead of
  repeating the race: hold the fonts (or the data) until the other side has
  painted.
- The second flake in the same issue was the opposite kind: a smoke that
  scrolls under `html { scroll-behavior: smooth }` then sleeps a fixed 400ms.
  Jump with `behavior: 'instant'` and wait on `scrollY`.
