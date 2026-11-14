---
date: 2026-11-13
tier: lesson
category: lesson
summary: When a list of ISO dates gains suffixed tokens (2026-10-31@2026-11-02), every plain string comparison (>, localeCompare) on it is silently wrong; compare by position in the list, and give the picker its own comparator
tags: [dates, url-state, frontend, what-changed, testing]
---

# A date with a suffix sorts after the bare date, as text

**Date:** 2026-11-13
**Issue:** #2475 (What Changed lists month-end revisions)

## What happened

What Changed treated its date list as ISO strings: "from must come before to"
was `from > to`, and the picker sorted with `localeCompare`. Revisions of a
month end became tokens `monthEnd@asOf`. As text `2026-10-31@2026-11-02` is
greater than `2026-10-31`, so the default pair "previous revision, latest
revision" read as reversed, and the picker listed the older revision above the
month end. The default-pair page test caught it before any browser did.

## Takeaway

Once a date list carries anything but bare dates, "ISO strings sort
chronologically" stops holding. Order by position in the list the page built
(the list is already in order), and give any sorted control an explicit
comparator. Grep for `>`, `<` and `localeCompare` on the list before adding a
token kind to it.
