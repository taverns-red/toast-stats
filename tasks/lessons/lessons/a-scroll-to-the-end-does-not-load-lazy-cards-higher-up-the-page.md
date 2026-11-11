---
date: 2026-11-11
tier: lesson
summary: Scrolling to the end of a page does not load near-viewport-held cards higher up, so a height cap measured there reads a partial page
tags: [tests, e2e, performance, mobile]
---

# Scrolling to the end does not load lazy cards higher up the page

**Issues:** #2578, #2571

Cards that hold their read until they near the viewport (#2513) load only when
a reader passes them. A helper that jumps straight to the bottom (`behavior:
'instant'`) skips the trophy case on the district hub: it sits more than a
600px margin above the end, so it stays a held placeholder. The placeholder
(640px) is taller than the loaded card (533px for D61), so the page measured
4055px against 3947px fully loaded. The old measurement (3947) and the old
page before #2564 (3947) were the same page; only the method differed. #2564
did not make the hub taller.

Takeaway: when a test measures a page that has held cards, scroll to each
held slot until its placeholder is gone (`loadHeldCards`), then settle. Assert
that no placeholder is left, so a partial page cannot pass as a full one.
