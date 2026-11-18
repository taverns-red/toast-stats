---
date: 2026-10-13
tier: lesson
summary: A height budget measured on macOS can fail on the Linux CI runner because the same web font sets wider there; a row with only a few px of slack wraps and adds a whole 44px line. Gate the worst-case content (the longest name, every link) and leave real headroom
tags: [mobile, layout, e2e, smoke, fonts, ci, club-page]
---

# A layout budget that fits on the Mac can wrap on the Linux runner

**Date:** 2026-10-13
**Issue:** #1843 (club hero ≤ 200 px at 375)

## What happened

The phone club hero measured 169 px at 375 locally, in both Chromium and
WebKit, against a 200 px budget. On the preview, the Linux runner measured
**213 px**. Its Website and "Contact on toastmasters.org ↗" links needed
about 304 of the row's 311 px on macOS. On Linux the same self-hosted fonts
set a few pixels wider, so the row wrapped. Each link is a 44 px tap target,
so the wrap added a full 44 px line.

## The takeaway

A row of fixed-height controls is a cliff, not a slope. A few pixels of
extra text width do not add a few pixels of height; they add a whole row.
When a height budget depends on a row like that:

- Leave real horizontal slack (tens of pixels, not single digits), or let
  the row truncate or drop an item instead of wrapping.
- Put the worst case under the gate, not only the demo record. Here that
  meant also measuring D61's longest club name, 51 characters, which wraps
  the title to two lines.
- Treat a local pass as provisional until the runner has measured it.
  Fonts, hinting and fallback metrics differ between macOS and Linux.

The fix moved the club website out of the hero into a "More about this
club" row, which left the link row with Contact only. The first attempt
still measured 212 px on the runner. The phone `display: none` rule had
the same specificity as the base `.club-meets__item` rule, which sits later
in the same layer, so the base rule won and the link never hid. That
attempt passed locally only because the Mac never wrapped the row. Check
that a hide rule really applies (computed `display` or a zero-height box),
not just that the budget passes on one machine.
